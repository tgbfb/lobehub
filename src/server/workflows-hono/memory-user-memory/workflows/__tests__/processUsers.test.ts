import { MemorySourceType } from '@lobechat/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as MemoryExtractionModule from '@/server/services/memory/userMemory/extract';

import { processUsersHandler } from '../processUsers';

const mocks = vi.hoisted(() => ({
  getUsers: vi.fn(),
  triggerProcessUserTopics: vi.fn(),
  triggerProcessUsers: vi.fn(),
}));

vi.mock('@/server/globalConfig/parseMemoryExtractionConfig', () => ({
  parseMemoryExtractionConfig: () => ({ upstashWorkflowExtraHeaders: { 'x-test': '1' } }),
}));

vi.mock('@/server/services/memory/userMemory/extract', async (importOriginal) => {
  const actual = await importOriginal<typeof MemoryExtractionModule>();

  return {
    ...actual,
    MemoryExtractionExecutor: {
      create: vi.fn(async () => ({
        getUsers: mocks.getUsers,
      })),
    },
    MemoryExtractionWorkflowService: {
      triggerProcessUserTopics: mocks.triggerProcessUserTopics,
      triggerProcessUsers: mocks.triggerProcessUsers,
    },
  };
});

const createWorkflowContext = (requestPayload: Record<string, unknown>) =>
  ({
    requestPayload,
    run: vi.fn(async (_name: string, callback: () => Promise<unknown> | unknown) => callback()),
  }) as unknown as Parameters<typeof processUsersHandler>[0];

describe('processUsersHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUsers.mockResolvedValue({
      cursor: { createdAt: new Date('2026-01-01T00:00:00.000Z'), id: 'user-cursor' },
      ids: ['user-1', 'user-2'],
    });
    mocks.triggerProcessUserTopics.mockResolvedValue({ workflowRunId: 'user-topics-run-id' });
    mocks.triggerProcessUsers.mockResolvedValue({ workflowRunId: 'next-users-run-id' });
  });

  it('returns statistics without scheduling child workflows when dryRun is enabled', async () => {
    /**
     * @example
     * expect(result.dryRun).toBe(true);
     */
    const result = await processUsersHandler(
      createWorkflowContext({
        baseUrl: 'https://api.example.com',
        dryRun: true,
        sources: [MemorySourceType.ChatTopic],
      }),
    );

    expect(result).toEqual({
      batches: 1,
      dryRun: true,
      nextCursor: 'user-cursor',
      processedUsers: 2,
      scheduledBatches: 0,
    });
    expect(mocks.triggerProcessUserTopics).not.toHaveBeenCalled();
    expect(mocks.triggerProcessUsers).not.toHaveBeenCalled();
  });
});
