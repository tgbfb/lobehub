import debug from 'debug';

import { gatewayEnv } from '@/envs/gateway';
import { getMessageGatewayClient } from '@/server/services/gateway/MessageGatewayClient';
import {
  BOT_RUNTIME_STATUSES,
  getRuntimeStatusErrorMessage,
  updateBotRuntimeStatus,
} from '@/server/services/gateway/runtimeStatus';

import {
  type BotPlatformRuntimeContext,
  type BotProviderConfig,
  ClientFactory,
  type PlatformClient,
  type PlatformMessenger,
  type UsageStats,
  type ValidationResult,
} from '../types';
import { formatUsageStats } from '../utils';

const log = debug('bot-platform:whatsapp-baileys:bot');

const PLATFORM_ID = 'whatsapp-baileys';

/**
 * Decode lobehub's composite thread id format `whatsapp-baileys:<jid>` into
 * the Baileys-native JID (e.g. `15551234567@s.whatsapp.net` for 1:1 chats,
 * `12345-6789@g.us` for groups). The same format is produced by the Node
 * gateway when it forwards inbound events to lobehub's webhook.
 */
function decodeThread(platformThreadId: string): string {
  const parts = platformThreadId.split(':');
  if (parts.length < 2 || parts[0] !== PLATFORM_ID) return platformThreadId;
  return parts.slice(1).join(':');
}

class WhatsAppBaileysClient implements PlatformClient {
  readonly id = PLATFORM_ID;
  readonly applicationId: string;

  private readonly config: BotProviderConfig;
  private readonly context: BotPlatformRuntimeContext;
  /**
   * Connection id used by `MessageGatewayClient`. We reuse the
   * `agentBotProvider.id` shape elsewhere in the codebase, but at this
   * layer we only have `applicationId` — and applicationId is already
   * unique per provider for this platform (operators pick a label they
   * own). Sufficient for the MVP single-replica gateway.
   */
  private get connectionId(): string {
    return this.applicationId;
  }

  constructor(config: BotProviderConfig, context: BotPlatformRuntimeContext) {
    this.config = config;
    this.context = context;
    this.applicationId = config.applicationId;
  }

  // ─── Lifecycle ───

  async start(): Promise<void> {
    log('Starting WhatsAppBaileysBot connectionId=%s', this.connectionId);
    await updateBotRuntimeStatus({
      applicationId: this.applicationId,
      platform: this.id,
      status: BOT_RUNTIME_STATUSES.starting,
    });

    const gateway = getMessageGatewayClient();
    if (!gateway.isNodeBackendConfigured) {
      const err = new Error(
        'whatsapp-baileys requires MESSAGE_GATEWAY_NODE_URL + MESSAGE_GATEWAY_NODE_SERVICE_TOKEN',
      );
      await updateBotRuntimeStatus({
        applicationId: this.applicationId,
        errorMessage: err.message,
        platform: this.id,
        status: BOT_RUNTIME_STATUSES.failed,
      });
      throw err;
    }

    try {
      await gateway.connect({
        applicationId: this.applicationId,
        connectionId: this.connectionId,
        connectionMode: 'websocket',
        // Baileys does not need pre-shared credentials — pairing happens
        // through QR. The gateway-side store keeps the resulting Signal
        // session keys, and on subsequent boots restores them via the
        // `/api/agent/internal/baileys-auth-state/:connectionId` callback.
        credentials: {},
        platform: this.id,
        userId: '',
        webhookPath: `/api/agent/webhooks/${this.id}/${encodeURIComponent(this.connectionId)}`,
      });

      // The Node gateway transitions through `pairing` → `connected` async.
      // We mark the runtime status as `starting`; the bot status is updated
      // to `connected` by the connection.opened webhook handler.
      log('whatsapp-baileys connect requested, awaiting pairing/open event');
    } catch (error) {
      await updateBotRuntimeStatus({
        applicationId: this.applicationId,
        errorMessage: getRuntimeStatusErrorMessage(error),
        platform: this.id,
        status: BOT_RUNTIME_STATUSES.failed,
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    log('Stopping WhatsAppBaileysBot connectionId=%s', this.connectionId);
    try {
      await getMessageGatewayClient().disconnect(this.connectionId, this.id);
    } catch (err) {
      log('disconnect threw (will continue tear-down): %O', err);
    }
    await updateBotRuntimeStatus({
      applicationId: this.applicationId,
      platform: this.id,
      status: BOT_RUNTIME_STATUSES.disconnected,
    });
  }

  // ─── Inbound adapter ───

  /**
   * Inbound events are forwarded by the Node gateway as raw Baileys
   * `messages.upsert` payloads. The chat-sdk adapter that parses these into
   * Chat-SDK Messages and dispatches them through `BotMessageRouter` is
   * intentionally NOT shipped in this MVP — it's tracked as a follow-up so
   * the message-gateway-node skeleton can land for review first.
   *
   * Returning an empty adapter map is safe because the platform is gated
   * behind `MESSAGE_GATEWAY_NODE_URL`: no production caller will reach
   * `BotMessageRouter.handleWebhook` for `whatsapp-baileys` until the
   * follow-up PR lands.
   */
  createAdapter(): Record<string, any> {
    return {};
  }

  // ─── Outbound messenger ───

  getMessenger(platformThreadId: string): PlatformMessenger {
    const jid = decodeThread(platformThreadId);
    const gateway = getMessageGatewayClient();
    const platform = this.id;
    const connectionId = this.connectionId;

    return {
      createMessage: async (content) => {
        await gateway.sendText(connectionId, `${PLATFORM_ID}:${jid}`, content, platform);
      },
      // WhatsApp Cloud API and Baileys do not support editing a sent
      // message — `supportsMessageEdit: false` already tells the bridge to
      // skip step-progress edits, but we keep this defensive impl in case
      // an unexpected caller invokes it.
      editMessage: async (_messageId, content) => {
        await gateway.sendText(connectionId, `${PLATFORM_ID}:${jid}`, content, platform);
      },
      // Reactions: Baileys supports them via `sock.sendMessage(jid,
      // { react: { text: emoji, key } })`. The Node gateway does not yet
      // expose a reaction endpoint; we leave these unwired for MVP so the
      // bridge falls through (optional methods).
      removeReaction: async () => {
        // no-op in MVP
      },
      triggerTyping: async () => {
        try {
          await gateway.startTyping(connectionId, `${PLATFORM_ID}:${jid}`, platform);
        } catch (err) {
          log('triggerTyping failed: %O', err);
        }
      },
    };
  }

  // ─── Helpers ───

  extractChatId(platformThreadId: string): string {
    return decodeThread(platformThreadId);
  }

  formatReply(body: string, stats?: UsageStats): string {
    if (!stats || !this.config.settings?.showUsageStats) return body;
    return `${body}\n\n${formatUsageStats(stats)}`;
  }

  parseMessageId(compositeId: string): string {
    return compositeId;
  }
}

export class WhatsAppBaileysClientFactory extends ClientFactory {
  createClient(config: BotProviderConfig, context: BotPlatformRuntimeContext): PlatformClient {
    return new WhatsAppBaileysClient(config, context);
  }

  /**
   * No external API to check against — pairing happens through QR scan
   * after the bot starts. We only validate that the operator-provided
   * label is non-empty and that the Node gateway is configured.
   */
  async validateCredentials(
    _credentials: Record<string, string>,
    _settings?: Record<string, unknown>,
    applicationId?: string,
  ): Promise<ValidationResult> {
    const errors: Array<{ field: string; message: string }> = [];
    if (!applicationId || !applicationId.trim()) {
      errors.push({ field: 'applicationId', message: 'Connection label is required' });
    }
    if (!gatewayEnv.MESSAGE_GATEWAY_NODE_URL || !gatewayEnv.MESSAGE_GATEWAY_NODE_SERVICE_TOKEN) {
      errors.push({
        field: 'applicationId',
        message:
          'message-gateway-node is not configured: set MESSAGE_GATEWAY_NODE_URL + MESSAGE_GATEWAY_NODE_SERVICE_TOKEN',
      });
    }
    if (errors.length > 0) return { errors, valid: false };
    return { valid: true };
  }
}
