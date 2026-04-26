import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const getGatewayConfig = () => {
  return createEnv({
    runtimeEnv: {
      // Pre-shared HMAC secret used by `message-gateway-node` to sign
      // Baileys auth-state callback requests (PUT/GET on the internal
      // `/api/agent/internal/baileys-auth-state/:connectionId` endpoint).
      BAILEYS_AUTH_STATE_SECRET: process.env.BAILEYS_AUTH_STATE_SECRET,
      DEVICE_GATEWAY_SERVICE_TOKEN: process.env.DEVICE_GATEWAY_SERVICE_TOKEN,
      DEVICE_GATEWAY_URL: process.env.DEVICE_GATEWAY_URL,
      MESSAGE_GATEWAY_ENABLED: process.env.MESSAGE_GATEWAY_ENABLED,
      // Optional: dedicated Node-runtime gateway for protocols that need
      // libsignal / native deps (today: WhatsApp Baileys). When unset the
      // `whatsapp-baileys` platform is hidden in the UI.
      MESSAGE_GATEWAY_NODE_SERVICE_TOKEN: process.env.MESSAGE_GATEWAY_NODE_SERVICE_TOKEN,
      MESSAGE_GATEWAY_NODE_URL: process.env.MESSAGE_GATEWAY_NODE_URL,
      MESSAGE_GATEWAY_SERVICE_TOKEN: process.env.MESSAGE_GATEWAY_SERVICE_TOKEN,
      MESSAGE_GATEWAY_URL: process.env.MESSAGE_GATEWAY_URL,
    },

    server: {
      BAILEYS_AUTH_STATE_SECRET: z.string().optional(),
      DEVICE_GATEWAY_SERVICE_TOKEN: z.string().optional(),
      DEVICE_GATEWAY_URL: z.string().url().optional(),
      MESSAGE_GATEWAY_ENABLED: z.string().optional(),
      MESSAGE_GATEWAY_NODE_SERVICE_TOKEN: z.string().optional(),
      MESSAGE_GATEWAY_NODE_URL: z.string().url().optional(),
      MESSAGE_GATEWAY_SERVICE_TOKEN: z.string().optional(),
      MESSAGE_GATEWAY_URL: z.string().url().optional(),
    },
  });
};

export const gatewayEnv = getGatewayConfig();
