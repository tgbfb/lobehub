import { createHmac, timingSafeEqual } from 'node:crypto';

import { agentBotProviders } from '@lobechat/database/schemas';
import debug from 'debug';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getServerDB } from '@/database/core/db-adaptor';
import { gatewayEnv } from '@/envs/gateway';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';

const log = debug('lobe-server:bot:baileys-auth-state');

/**
 * Internal endpoint used by the private message-gateway-node service to
 * persist Baileys auth state (Signal session creds + ratchet keys) on
 * lobehub's side. The Node container is stateless — restarting it doesn't
 * trigger a re-pair because the encrypted blob lives here.
 *
 * Auth: HMAC-SHA256 over the canonical string
 *   `${connectionId}:${timestamp}:${sha256-of-body-hex}`
 * keyed with `BAILEYS_AUTH_STATE_SECRET`. Mirrors `signAuthStateRequest`
 * in the message-gateway-node repo (kept in a separate, private repo so
 * the WhatsApp Baileys integration can ship without entering the
 * open-source LobeHub codebase).
 *
 * Storage: the gzipped+base64 blob is written into the encrypted
 * `agent_bot_providers.credentials` JSON under the `baileysAuthState` key.
 * This piggybacks on the existing per-row encryption so we don't need a
 * second secret manager. The row is keyed by `id` (UUID), which is the
 * `connectionId` the gateway sees.
 */

// 5-minute timestamp skew window — long enough to tolerate clock drift
// between the Node gateway and lobehub, short enough that a leaked
// signature can't be replayed indefinitely.
const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

interface VerifyResult {
  ok: boolean;
  reason?: string;
}

function verifySignature(
  connectionId: string,
  body: string,
  headerSig: string | null,
  headerTs: string | null,
  secret: string,
): VerifyResult {
  if (!headerSig || !headerTs) return { ok: false, reason: 'missing signature headers' };
  const ts = Number(headerTs);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid timestamp' };
  if (Math.abs(Date.now() - ts) > MAX_TIMESTAMP_SKEW_MS) {
    return { ok: false, reason: 'timestamp skew too large' };
  }
  const bodyHash = createHmac('sha256', '').update(body, 'utf8').digest('hex');
  const canonical = `${connectionId}:${ts}:${bodyHash}`;
  const expected = createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(headerSig, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}

function authSecret(): string | null {
  return gatewayEnv.BAILEYS_AUTH_STATE_SECRET ?? null;
}

/**
 * Read+decrypt+mutate+re-encrypt the `credentials` JSON for a given
 * provider row. We do this in the route handler rather than the model so
 * the model contract stays user-scoped — this endpoint is system-scoped
 * (no userId is available from the gateway request).
 */
async function loadCredentials(connectionId: string): Promise<Record<string, unknown> | null> {
  const db = await getServerDB();
  const [row] = await db
    .select({ credentials: agentBotProviders.credentials })
    .from(agentBotProviders)
    .where(eq(agentBotProviders.id, connectionId))
    .limit(1);

  if (!row) return null;
  if (!row.credentials) return {};

  const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
  try {
    const { plaintext } = await gateKeeper.decrypt(row.credentials);
    return JSON.parse(plaintext) as Record<string, unknown>;
  } catch {
    // Row exists but credentials are unreadable — surface as "no state"
    // rather than 500, matching the behavior the gateway expects when the
    // row was just created without a saved auth state yet.
    return {};
  }
}

async function saveCredentials(
  connectionId: string,
  credentials: Record<string, unknown>,
): Promise<boolean> {
  const db = await getServerDB();
  const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
  const ciphertext = await gateKeeper.encrypt(JSON.stringify(credentials));

  const result = await db
    .update(agentBotProviders)
    .set({ credentials: ciphertext, updatedAt: new Date() })
    .where(eq(agentBotProviders.id, connectionId))
    .returning({ id: agentBotProviders.id });

  return result.length > 0;
}

export const GET = async (
  req: Request,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<Response> => {
  const { connectionId } = await params;
  const secret = authSecret();
  if (!secret) {
    return NextResponse.json({ error: 'auth-state secret not configured' }, { status: 503 });
  }

  const verify = verifySignature(
    connectionId,
    '', // GET has no body
    req.headers.get('x-baileys-signature'),
    req.headers.get('x-baileys-timestamp'),
    secret,
  );
  if (!verify.ok) {
    log('GET %s rejected: %s', connectionId, verify.reason);
    return NextResponse.json({ error: verify.reason }, { status: 401 });
  }

  const credentials = await loadCredentials(connectionId);
  if (!credentials) {
    return NextResponse.json({ error: 'connection not found' }, { status: 404 });
  }

  const blob = credentials.baileysAuthState;
  if (!blob || typeof blob !== 'object') {
    // No persisted auth state yet — gateway will fall through to pairing.
    return NextResponse.json({ error: 'no auth state stored' }, { status: 404 });
  }

  return NextResponse.json(blob);
};

export const PUT = async (
  req: Request,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<Response> => {
  const { connectionId } = await params;
  const secret = authSecret();
  if (!secret) {
    return NextResponse.json({ error: 'auth-state secret not configured' }, { status: 503 });
  }

  const body = await req.text();
  const verify = verifySignature(
    connectionId,
    body,
    req.headers.get('x-baileys-signature'),
    req.headers.get('x-baileys-timestamp'),
    secret,
  );
  if (!verify.ok) {
    log('PUT %s rejected: %s', connectionId, verify.reason);
    return NextResponse.json({ error: verify.reason }, { status: 401 });
  }

  let blob: unknown;
  try {
    blob = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!blob || typeof blob !== 'object') {
    return NextResponse.json({ error: 'expected JSON object' }, { status: 400 });
  }

  const credentials = await loadCredentials(connectionId);
  if (!credentials) {
    return NextResponse.json({ error: 'connection not found' }, { status: 404 });
  }

  credentials.baileysAuthState = blob;
  const ok = await saveCredentials(connectionId, credentials);
  if (!ok) {
    return NextResponse.json({ error: 'connection not found' }, { status: 404 });
  }

  log('PUT %s persisted (size=%d)', connectionId, body.length);
  return new Response(null, { status: 204 });
};
