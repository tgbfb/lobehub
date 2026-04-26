import debug from 'debug';

import { gatewayEnv } from '@/envs/gateway';

const log = debug('lobe-server:message-gateway-client');

// ─── Types ───

export interface MessageGatewayConnectionConfig {
  /** Platform application ID (e.g., Feishu appId, QQ appId) */
  applicationId?: string;
  connectionId: string;
  /** Preferred connection mode (e.g., "webhook", "websocket"). Falls back to platform default if omitted. */
  connectionMode?: string;
  credentials: Record<string, unknown>;
  platform: string;
  userId: string;
  webhookPath: string;
}

export interface MessageGatewayConnectionStatus {
  config: { connectionId: string; platform: string } | null;
  state: {
    connectedAt?: number;
    error?: string;
    platform: string;
    status: 'connected' | 'connecting' | 'disconnected' | 'dormant' | 'error';
  };
}

export interface MessageGatewayStats {
  byPlatform: Record<string, number>;
  connections: Array<{
    connectionId: string;
    platform: string;
    state: { status: string };
    userId: string;
  }>;
  total: number;
}

// ─── Per-platform routing ───

/**
 * Platforms that need a Node-runtime gateway (libsignal, native deps).
 * Routed to `MESSAGE_GATEWAY_NODE_URL` instead of the default CF gateway.
 */
const NODE_GATEWAY_PLATFORMS = new Set(['whatsapp-baileys']);

interface GatewayBackend {
  baseUrl: string;
  serviceToken: string;
}

// ─── Client ───

/**
 * HTTP client for the message-gateway Cloudflare Worker.
 *
 * The gateway is a pure connection proxy — it only manages persistent
 * connections (WebSocket/long-polling) and forwards inbound events to
 * LobeHub's webhook. Outbound messaging is NOT routed through the gateway;
 * LobeHub calls platform REST APIs directly.
 *
 * Two backend pools exist: the Cloudflare Workers `message-gateway` (for
 * Discord/QQ/etc.) and an optional Node-runtime `message-gateway-node` for
 * libsignal-based platforms (today: `whatsapp-baileys`). Routing is
 * driven by `NODE_GATEWAY_PLATFORMS` and the `MESSAGE_GATEWAY_NODE_URL` env.
 */
export class MessageGatewayClient {
  private cf: GatewayBackend;
  private node: GatewayBackend;

  constructor(baseUrl?: string, serviceToken?: string) {
    if (baseUrl !== undefined) {
      // Test / manual override — the explicit (url, token) pair targets the
      // CF backend only. The Node backend stays unconfigured so tests don't
      // double-count when methods that fan out across backends (getStats,
      // disconnectAll) aggregate results.
      this.cf = { baseUrl, serviceToken: serviceToken || '' };
      this.node = { baseUrl: '', serviceToken: '' };
    } else {
      this.cf = {
        baseUrl: gatewayEnv.MESSAGE_GATEWAY_URL || '',
        serviceToken: gatewayEnv.MESSAGE_GATEWAY_SERVICE_TOKEN || '',
      };
      this.node = {
        baseUrl: gatewayEnv.MESSAGE_GATEWAY_NODE_URL || '',
        serviceToken: gatewayEnv.MESSAGE_GATEWAY_NODE_SERVICE_TOKEN || '',
      };
    }
  }

  /** Pick the right backend for a given platform. */
  private backendFor(platform: string | undefined): GatewayBackend {
    if (platform && NODE_GATEWAY_PLATFORMS.has(platform)) return this.node;
    return this.cf;
  }

  /** True when at least one backend (CF or Node) has URL + token configured. */
  get isConfigured(): boolean {
    return (
      Boolean(this.cf.baseUrl && this.cf.serviceToken) ||
      Boolean(this.node.baseUrl && this.node.serviceToken)
    );
  }

  /**
   * Whether the gateway should be used for active flows (typing, connect, etc.).
   * Requires MESSAGE_GATEWAY_ENABLED=1 in addition to URL/token. This lets us
   * disable the gateway during migration while keeping the client reachable
   * for cleanup (via isConfigured).
   */
  get isEnabled(): boolean {
    return gatewayEnv.MESSAGE_GATEWAY_ENABLED === '1' && this.isConfigured;
  }

  /** True when the Node gateway is configured — used to gate UI for `whatsapp-baileys`. */
  get isNodeBackendConfigured(): boolean {
    return Boolean(this.node.baseUrl && this.node.serviceToken);
  }

  // ─── Connection Management ───

  async connect(config: MessageGatewayConnectionConfig): Promise<{ status: string }> {
    log('Connecting %s:%s (platform=%s)', config.connectionId, config.userId, config.platform);

    const res = await this.post('/api/connections', { config }, this.backendFor(config.platform));

    if (!res.ok) {
      const error = await res.text();
      log('Connect failed: %s', error);
      throw new Error(`message-gateway connect failed (${res.status}): ${error}`);
    }

    return res.json();
  }

  /**
   * Disconnect every active connection on **both** backends. Each call is
   * fire-and-forget per backend; failures on one backend don't block the
   * other.
   */
  async disconnectAll(): Promise<{ total: number }> {
    log('Disconnecting all connections');

    const results = await Promise.allSettled(
      this.allBackends().map(async (b) => {
        const res = await this.fetch('/api/connections', { method: 'DELETE' }, b);
        if (!res.ok) {
          throw new Error(`disconnect-all (${b.baseUrl}) failed: ${res.status}`);
        }
        return (await res.json()) as { total: number };
      }),
    );

    let total = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') total += r.value.total;
    }
    return { total };
  }

  /**
   * Disconnect a connection by id. Without a `platform` hint we don't know
   * which backend owns it, so we try the Node backend first (smaller pool,
   * cheaper miss) then fall back to CF. Both 404 paths are tolerated.
   */
  async disconnect(connectionId: string, platform?: string): Promise<{ status: string }> {
    log('Disconnecting %s (platform=%s)', connectionId, platform ?? '?');

    if (platform) {
      const backend = this.backendFor(platform);
      const res = await this.fetch(
        `/api/connections/${encodeURIComponent(connectionId)}`,
        { method: 'DELETE' },
        backend,
      );
      if (!res.ok) {
        const error = await res.text();
        throw new Error(`message-gateway disconnect failed (${res.status}): ${error}`);
      }
      return res.json();
    }

    // Unknown platform — try every configured backend, return the first
    // 2xx response. This branch is only hit during emergency cleanup
    // where the calling site has lost the platform context.
    for (const backend of this.allBackends()) {
      const res = await this.fetch(
        `/api/connections/${encodeURIComponent(connectionId)}`,
        { method: 'DELETE' },
        backend,
      );
      if (res.ok) return res.json();
    }
    return { status: 'not_found' };
  }

  // ─── Typing ───

  async startTyping(
    connectionId: string,
    platformThreadId: string,
    platform?: string,
  ): Promise<void> {
    await this.post(
      `/api/connections/${encodeURIComponent(connectionId)}/typing`,
      { platformThreadId },
      this.backendFor(platform),
    );
  }

  async stopTyping(
    connectionId: string,
    platformThreadId: string,
    platform?: string,
  ): Promise<void> {
    await this.fetch(
      `/api/connections/${encodeURIComponent(connectionId)}/typing`,
      {
        body: JSON.stringify({ platformThreadId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      },
      this.backendFor(platform),
    );
  }

  // ─── Status & Admin ───

  async getStatus(
    connectionId: string,
    platform?: string,
  ): Promise<MessageGatewayConnectionStatus> {
    const res = await this.fetch(
      `/api/connections/${encodeURIComponent(connectionId)}/status`,
      undefined,
      this.backendFor(platform),
    );

    if (!res.ok) {
      throw new Error(`message-gateway status failed (${res.status})`);
    }

    return res.json();
  }

  async getStats(): Promise<MessageGatewayStats> {
    // Aggregate across both backends so admin dashboards see a unified view.
    const responses = await Promise.allSettled(
      this.allBackends().map(async (b) => {
        const res = await this.fetch('/api/admin/stats', undefined, b);
        if (!res.ok) throw new Error(`stats (${b.baseUrl}) failed: ${res.status}`);
        return (await res.json()) as MessageGatewayStats;
      }),
    );

    const merged: MessageGatewayStats = { byPlatform: {}, connections: [], total: 0 };
    for (const r of responses) {
      if (r.status !== 'fulfilled') continue;
      merged.total += r.value.total;
      merged.connections.push(...r.value.connections);
      for (const [k, v] of Object.entries(r.value.byPlatform)) {
        merged.byPlatform[k] = (merged.byPlatform[k] ?? 0) + v;
      }
    }
    return merged;
  }

  /**
   * Send a plain-text outbound message via the gateway. Used by the
   * lobehub-side messenger for platforms whose outbound REST API is not
   * publicly exposed — today only `whatsapp-baileys`, where the WhatsApp
   * Web socket lives in the Node gateway and lobehub server has no direct
   * way to call WhatsApp.
   */
  async sendText(
    connectionId: string,
    platformThreadId: string,
    text: string,
    platform?: string,
  ): Promise<{ messageId?: string }> {
    const res = await this.post(
      `/api/connections/${encodeURIComponent(connectionId)}/send`,
      { platformThreadId, text },
      this.backendFor(platform),
    );
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`message-gateway sendText failed (${res.status}): ${error}`);
    }
    return res.json();
  }

  /**
   * Latest QR data URL for a connection in `pairing` state, or null when
   * none is currently active. Polled by the lobehub QR pairing UI.
   */
  async getPairingQr(connectionId: string, platform: string): Promise<{ dataUrl: string } | null> {
    const res = await this.fetch(
      `/api/connections/${encodeURIComponent(connectionId)}/pairing-qr`,
      undefined,
      this.backendFor(platform),
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`message-gateway pairing-qr failed (${res.status})`);
    }
    return res.json();
  }

  // ─── Internal HTTP ───

  /** All configured backends (in CF → Node order so the CF gateway dominates). */
  private allBackends(): GatewayBackend[] {
    const out: GatewayBackend[] = [];
    if (this.cf.baseUrl && this.cf.serviceToken) out.push(this.cf);
    if (this.node.baseUrl && this.node.serviceToken) out.push(this.node);
    return out;
  }

  private async fetch(
    path: string,
    init: RequestInit | undefined,
    backend: GatewayBackend,
  ): Promise<Response> {
    if (!backend.baseUrl || !backend.serviceToken) {
      throw new Error(
        'MessageGatewayClient backend not configured for this platform: set the matching MESSAGE_GATEWAY_URL / MESSAGE_GATEWAY_NODE_URL env vars',
      );
    }

    const url = `${backend.baseUrl}${path}`;

    return globalThis.fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${backend.serviceToken}`,
      },
    });
  }

  private async post(path: string, body: unknown, backend: GatewayBackend): Promise<Response> {
    return this.fetch(
      path,
      {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
      backend,
    );
  }
}

// ─── Singleton ───

let _client: MessageGatewayClient | undefined;

export function getMessageGatewayClient(): MessageGatewayClient {
  if (!_client) {
    _client = new MessageGatewayClient();
  }
  return _client;
}
