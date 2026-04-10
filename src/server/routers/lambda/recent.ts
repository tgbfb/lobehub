import { z } from 'zod';

import { RecentModel } from '@/database/models/recent';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

export interface RecentItem {
  icon: string;
  id: string;
  routePath: string;
  title: string;
  type: 'topic' | 'document' | 'file' | 'task';
  updatedAt: Date;
}

const recentProcedure = authedProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  return opts.next({
    ctx: {
      recentModel: new RecentModel(ctx.serverDB, ctx.userId),
    },
  });
});

export const recentRouter = router({
  getAll: recentProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ ctx, input }): Promise<RecentItem[]> => {
      const limit = input?.limit ?? 10;

      const items = await ctx.recentModel.queryRecent(limit);

      return items.map((item) => {
        let routePath: string;

        switch (item.type) {
          case 'topic': {
            routePath = item.routeGroupId
              ? `/group/${item.routeGroupId}?topic=${item.id}`
              : `/agent/${item.routeId}?topic=${item.id}`;
            break;
          }
          case 'document': {
            routePath = `/page/${item.id}`;
            break;
          }
          case 'file': {
            routePath = `/resource?file=${item.id}`;
            break;
          }
          case 'task': {
            routePath = `/agent/${item.routeId}`;
            break;
          }
        }

        return {
          icon: item.type,
          id: item.id,
          routePath,
          title: item.title,
          type: item.type,
          updatedAt: item.updatedAt,
        };
      });
    }),
});

export type RecentRouter = typeof recentRouter;
