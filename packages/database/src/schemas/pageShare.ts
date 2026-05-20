import { index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { createNanoId } from '../utils/idGenerator';
import { timestamps } from './_helpers';
import { documents } from './file';
import { users } from './user';

/**
 * Page sharing table - Manages public sharing links for documents/pages.
 */
export const pageShares = pgTable(
  'page_shares',
  {
    id: text('id')
      .$defaultFn(() => createNanoId(8)())
      .primaryKey(),

    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    visibility: text('visibility').default('private').notNull(), // 'private' | 'link'

    pageViewCount: integer('page_view_count').default(0).notNull(),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('page_shares_document_id_unique').on(t.documentId),
    index('page_shares_user_id_idx').on(t.userId),
  ],
);

export type NewPageShare = typeof pageShares.$inferInsert;
export type PageShareItem = typeof pageShares.$inferSelect;
