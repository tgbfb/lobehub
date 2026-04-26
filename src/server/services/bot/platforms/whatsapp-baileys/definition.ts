import type { PlatformDefinition } from '../types';
import { WhatsAppBaileysClientFactory } from './client';
import { schema } from './schema';

/**
 * Personal WhatsApp via Baileys.
 *
 * **Hosting**: a private long-running Node gateway (kept in a separate,
 * non-open-source repo). The lobehub server itself never opens a WhatsApp
 * Web socket — it delegates connect/disconnect/sendText/typing to the Node
 * gateway via `MessageGatewayClient`, and receives inbound events at the
 * platform's webhook URL.
 *
 * **ToS warning**: WhatsApp's Terms of Service prohibit the use of
 * unofficial reverse-engineered clients. This platform is intentionally
 * gated behind `MESSAGE_GATEWAY_NODE_URL` so it only appears in
 * deployments that have the gateway wired up (today: LobeHub Cloud).
 */
export const whatsappBaileys: PlatformDefinition = {
  clientFactory: new WhatsAppBaileysClientFactory(),
  connectionMode: 'websocket',
  description: 'Connect a personal WhatsApp account via QR pairing (LobeHub Cloud only).',
  documentation: {
    setupGuideUrl: 'https://lobehub.com/docs/usage/channels/whatsapp-baileys',
  },
  id: 'whatsapp-baileys',
  name: 'WhatsApp (Baileys)',
  schema,
  // Gateway forwards events to /api/agent/webhooks/whatsapp-baileys/<connectionId>;
  // we don't expose this URL in the UI because pairing flows through QR.
  showWebhookUrl: false,
  supportsMarkdown: true,
  // WhatsApp does not support editing sent messages.
  supportsMessageEdit: false,
};
