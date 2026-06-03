import { index, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { createNanoId } from '../utils/idGenerator';
import { timestamps } from './_helpers';
import { agents } from './agent';

export interface AgentShareConfig {
  allowReadMemory?: boolean;
  filePermissionConfig?: {
    agentFiles?: 'none' | 'read';
    knowledgeBase?: 'none' | 'read';
    uploadAllowed?: boolean;
  };
  guestEnabled?: boolean;
  maxGuestTopics?: number;
  tipSplitRatio?: number;
}

export const agentShares = pgTable(
  'agent_shares',
  {
    id: text('id')
      .$defaultFn(() => createNanoId(8)())
      .primaryKey(),

    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),

    visibility: text('visibility').default('private').notNull(), // 'private' | 'link'

    shareConfig: jsonb('share_config').$type<AgentShareConfig>(),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('agent_shares_agent_id_unique').on(t.agentId),
    index('agent_shares_visibility_idx').on(t.visibility),
  ],
);

export type NewAgentShare = typeof agentShares.$inferInsert;
export type AgentShareItem = typeof agentShares.$inferSelect;
