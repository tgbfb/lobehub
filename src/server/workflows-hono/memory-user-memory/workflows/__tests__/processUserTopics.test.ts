import { MemorySourceType } from '@lobechat/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as MemoryExtractionModule from '@/server/services/memory/userMemory/extract';

import { processUserTopicsHandler } from '../processUserTopics';

const mocks = vi.hoisted(() => ({
  filterTopicIdsForUser: vi.fn(),
  getTopicsForUser: vi.fn(),
  triggerProcessTopics: vi.fn(),
  triggerProcessUserTopics: vi.fn(),
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
        filterTopicIdsForUser: mocks.filterTopicIdsForUser,
        getTopicsForUser: mocks.getTopicsForUser,
      })),
    },
    MemoryExtractionWorkflowService: {
      triggerProcessTopics: mocks.triggerProcessTopics,
      triggerProcessUserTopics: mocks.triggerProcessUserTopics,
    },
  };
});

const createWorkflowContext = (requestPayload: Record<string, unknown>) =>
  ({
    requestPayload,
    run: vi.fn(async (_name: string, callback: () => Promise<unknown> | unknown) => callback()),
  }) as unknown as Parameters<typeof processUserTopicsHandler>[0];

describe('processUserTopicsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filterTopicIdsForUser.mockImplementation(async (_userId, topicIds: string[]) => topicIds);
    mocks.getTopicsForUser.mockResolvedValue({ ids: [] });
    mocks.triggerProcessTopics.mockResolvedValue({ workflowRunId: 'workflow-run-id' });
    mocks.triggerProcessUserTopics.mockResolvedValue({ workflowRunId: 'next-page-run-id' });
  });

  it('keeps topic batches under the standard fan-out chunk size together', async () => {
    /**
     * @example
     * expect(result.processedUsers).toBe(1);
     */
    const topicIds = ['topic-1', 'topic-2', 'topic-3', 'topic-4', 'topic-5'];
    const context = createWorkflowContext({
      baseUrl: 'https://api.example.com',
      sources: [MemorySourceType.ChatTopic],
      topicIds,
      userIds: ['user-1'],
    });

    const result = await processUserTopicsHandler(context);

    expect(result).toEqual({ processedUsers: 1 });
    expect(mocks.triggerProcessTopics).toHaveBeenCalledTimes(1);
    expect(mocks.triggerProcessTopics).toHaveBeenNthCalledWith(
      1,
      'user-1',
      expect.objectContaining({ topicIds }),
      { extraHeaders: { 'x-test': '1' } },
    );
  });
});
