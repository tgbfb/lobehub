import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

import { agents, agentShares } from '../schemas';
import type { AgentShareConfig, AgentShareItem } from '../schemas/agentShare';
import type { LobeChatDatabase } from '../type';

export type { AgentShareConfig, AgentShareItem };

export type SharedAgentData = NonNullable<
  Awaited<ReturnType<(typeof AgentShareModel)['findByShareId']>>
>;

export class AgentShareModel {
  private userId: string;
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase, userId: string) {
    this.userId = userId;
    this.db = db;
  }

  create = async (agentId: string) => {
    const agent = await this.db.query.agents.findFirst({
      columns: { id: true },
      where: and(eq(agents.id, agentId), eq(agents.userId, this.userId)),
    });

    if (!agent) throw new Error('Agent not found or not owned by user');

    const [result] = await this.db
      .insert(agentShares)
      .values({ agentId })
      .onConflictDoNothing({ target: agentShares.agentId })
      .returning();

    if (!result) return this.getByAgentId(agentId);

    return result;
  };

  updateConfig = async (
    agentId: string,
    config: Partial<Pick<AgentShareItem, 'shareConfig' | 'visibility'>>,
  ) => {
    const agent = await this.db.query.agents.findFirst({
      columns: { id: true },
      where: and(eq(agents.id, agentId), eq(agents.userId, this.userId)),
    });

    if (!agent) return null;

    const [result] = await this.db
      .update(agentShares)
      .set({ ...config, updatedAt: new Date() })
      .where(eq(agentShares.agentId, agentId))
      .returning();

    return result || null;
  };

  delete = async (agentId: string) => {
    const agent = await this.db.query.agents.findFirst({
      columns: { id: true },
      where: and(eq(agents.id, agentId), eq(agents.userId, this.userId)),
    });

    if (!agent) return;

    return this.db.delete(agentShares).where(eq(agentShares.agentId, agentId));
  };

  getByAgentId = async (agentId: string) => {
    const [result] = await this.db
      .select()
      .from(agentShares)
      .where(eq(agentShares.agentId, agentId))
      .limit(1);

    return result || null;
  };

  static findByShareId = async (db: LobeChatDatabase, shareId: string) => {
    const [result] = await db
      .select({
        agentAvatar: agents.avatar,
        agentBackgroundColor: agents.backgroundColor,
        agentDescription: agents.description,
        agentId: agentShares.agentId,
        agentTags: agents.tags,
        agentTitle: agents.title,
        creatorId: agents.userId,
        shareConfig: agentShares.shareConfig,
        shareId: agentShares.id,
        visibility: agentShares.visibility,
      })
      .from(agentShares)
      .innerJoin(agents, eq(agentShares.agentId, agents.id))
      .where(eq(agentShares.id, shareId))
      .limit(1);

    return result || null;
  };

  static findByShareIdWithAccessCheck = async (
    db: LobeChatDatabase,
    shareId: string,
    accessUserId?: string,
  ): Promise<SharedAgentData> => {
    const share = await AgentShareModel.findByShareId(db, shareId);

    if (!share) throw new TRPCError({ code: 'NOT_FOUND', message: 'Share not found' });

    const isOwner = accessUserId && share.creatorId === accessUserId;

    if (!isOwner && share.visibility === 'private') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'This share is private' });
    }

    return share;
  };
}
