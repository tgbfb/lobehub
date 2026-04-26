import { DEFAULT_BOT_DEBOUNCE_MS, MAX_BOT_DEBOUNCE_MS } from '@lobechat/const';

import { displayToolCallsField, userIdField } from '../const';
import type { FieldSchema } from '../types';

/**
 * Schema for the WhatsApp Baileys (personal account) platform.
 *
 * Unlike the Cloud API path, Baileys does not need pre-shared credentials —
 * pairing happens through a QR code emitted at runtime by the Node gateway.
 * The `applicationId` is left for operators who want a stable identifier
 * for the connection (a phone number or label); it is not validated against
 * any external API.
 */
export const schema: FieldSchema[] = [
  {
    key: 'applicationId',
    description: 'channel.whatsappBaileys.connectionLabelHint',
    label: 'channel.whatsappBaileys.connectionLabel',
    placeholder: 'channel.whatsappBaileys.connectionLabelPlaceholder',
    required: true,
    type: 'string',
  },
  {
    key: 'settings',
    label: 'channel.settings',
    properties: [
      {
        key: 'charLimit',
        // Baileys has no hard cap, but WhatsApp's UI truncates long bubbles
        // and adds a "View more" affordance — keep replies tight.
        default: 4000,
        description: 'channel.charLimitHint',
        label: 'channel.charLimit',
        maximum: 8000,
        minimum: 100,
        type: 'number',
      },
      {
        key: 'concurrency',
        default: 'queue',
        description: 'channel.concurrencyHint',
        enum: ['queue', 'debounce'],
        enumLabels: ['channel.concurrencyQueue', 'channel.concurrencyDebounce'],
        label: 'channel.concurrency',
        type: 'string',
      },
      {
        key: 'debounceMs',
        default: DEFAULT_BOT_DEBOUNCE_MS,
        description: 'channel.debounceMsHint',
        label: 'channel.debounceMs',
        maximum: MAX_BOT_DEBOUNCE_MS,
        minimum: 100,
        type: 'number',
        visibleWhen: { field: 'concurrency', value: 'debounce' },
      },
      {
        key: 'showUsageStats',
        default: false,
        description: 'channel.showUsageStatsHint',
        label: 'channel.showUsageStats',
        type: 'boolean',
      },
      displayToolCallsField,
      userIdField,
    ],
    type: 'object',
  },
];
