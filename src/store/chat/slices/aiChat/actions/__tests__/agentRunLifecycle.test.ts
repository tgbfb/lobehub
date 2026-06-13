import type * as LobeConst from '@lobechat/const';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { topicService } from '@/services/topic';
import { emitClientAgentSignalSourceEvent } from '@/store/chat/slices/aiChat/actions/agentSignalBridge';

import { runAgentRunLifecycle } from '../agentRunLifecycle';

const desktopEnv = vi.hoisted(() => ({ isDesktop: false }));
const desktopNotificationMock = vi.hoisted(() => ({
  showNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@lobechat/const', async (importOriginal) => {
  const actual = await importOriginal<typeof LobeConst>();

  return {
    ...actual,
    get isDesktop() {
      return desktopEnv.isDesktop;
    },
  };
});

vi.mock('i18next', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('@/services/electron/desktopNotification', () => ({
  desktopNotificationService: desktopNotificationMock,
}));

vi.mock('@/services/topic', () => ({
  topicService: {
    updateTopicMetadata: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/store/agent', () => ({
  getAgentStoreState: vi.fn(() => ({})),
}));

vi.mock('@/store/agent/selectors', () => ({
  agentSelectors: {
    getAgentMetaById: vi.fn(() => () => ({ title: 'Agent title' })),
  },
}));

vi.mock('@/store/chat/slices/aiChat/actions/agentSignalBridge', () => ({
  emitClientAgentSignalSourceEvent: vi.fn().mockResolvedValue(undefined),
}));

const createStore = (overrides: Record<string, unknown> = {}) => {
  const events: string[] = [];

  return {
    events,
    completeOperation: vi.fn(() => {
      events.push('complete');
    }),
    drainQueuedMessages: vi.fn(() => {
      events.push('drain');
      return [
        {
          content: 'queued follow-up',
          createdAt: 1,
          id: 'queued-1',
          interruptMode: 'soft',
        },
      ];
    }),
    internal_updateTopicLoading: vi.fn(),
    markUnreadCompleted: vi.fn(() => {
      events.push('unread');
    }),
    messagesMap: {},
    operations: {
      'op-1': {
        context: { agentId: 'agent-1', topicId: 'topic-1' },
        metadata: {
          runtimeHooks: {
            afterCompletionCallbacks: [
              vi.fn(() => {
                events.push('afterCompletion');
              }),
            ],
          },
        },
      },
    },
    sendMessage: vi.fn(async () => {
      events.push('sendMessage');
    }),
    topicDataMap: {},
    updateTopicStatus: vi.fn(),
    ...overrides,
  } as any;
};

describe('runAgentRunLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    desktopEnv.isDesktop = false;
    vi.useRealTimers();
  });

  it('runs completion hooks, completes operation, emits signal, then drains queued messages', async () => {
    vi.useFakeTimers();
    const store = createStore();
    const get = vi.fn(() => store);

    const result = await runAgentRunLifecycle({
      afterRunComplete: [
        () => {
          store.events.push('afterRunComplete');
        },
      ],
      anchorMessageId: 'asst-1',
      assistantMessageId: 'asst-1',
      beforeRunComplete: [
        () => {
          store.events.push('beforeRunComplete');
        },
      ],
      context: { agentId: 'agent-1', topicId: 'topic-1' } as any,
      get,
      operationId: 'op-1',
      phase: 'runComplete',
      queueDrainDelayMs: 0,
      runtimeType: 'client',
      status: 'completed',
      triggerMessageId: 'user-1',
    });

    expect(result).toEqual({ contextKey: 'main_agent-1_topic-1', queuedMessageCount: 1 });
    expect(store.events).toEqual([
      'afterCompletion',
      'beforeRunComplete',
      'complete',
      'unread',
      'drain',
      'afterRunComplete',
    ]);
    expect(emitClientAgentSignalSourceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          assistantMessageId: 'asst-1',
          operationId: 'op-1',
          runtimeType: 'client',
          status: 'completed',
          triggerMessageId: 'user-1',
        }),
        sourceId: 'op-1:client:complete',
        sourceType: 'client.runtime.complete',
      }),
    );

    await vi.runOnlyPendingTimersAsync();
    expect(store.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ agentId: 'agent-1', topicId: 'topic-1' }),
        message: 'queued follow-up',
      }),
    );
  });

  it('keeps success completion moving when a runtime-specific before hook fails', async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createStore();

    await runAgentRunLifecycle({
      beforeRunComplete: [
        async () => {
          throw new Error('metadata write failed');
        },
      ],
      context: { agentId: 'agent-1', topicId: 'topic-1' } as any,
      get: () => store,
      operationId: 'op-1',
      phase: 'runComplete',
      queueDrainDelayMs: 0,
      runtimeType: 'heterogeneous',
      status: 'completed',
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[AgentRunLifecycle] beforeRunComplete callback failed:',
      expect.any(Error),
    );
    expect(store.completeOperation).toHaveBeenCalledWith('op-1');
    expect(store.drainQueuedMessages).toHaveBeenCalledWith('main_agent-1_topic-1');

    await vi.runOnlyPendingTimersAsync();
    expect(store.sendMessage).toHaveBeenCalled();
  });

  it('does not drain queued messages for failed or cancelled terminal states', async () => {
    const store = createStore();

    await runAgentRunLifecycle({
      context: { agentId: 'agent-1', topicId: 'topic-1' } as any,
      get: () => store,
      operationId: 'op-1',
      phase: 'runComplete',
      runtimeType: 'gateway',
      status: 'failed',
    });

    await runAgentRunLifecycle({
      context: { agentId: 'agent-1', topicId: 'topic-1' } as any,
      get: () => store,
      operationId: 'op-1',
      phase: 'runComplete',
      runtimeType: 'gateway',
      status: 'cancelled',
    });

    expect(store.completeOperation).toHaveBeenCalledTimes(2);
    expect(store.drainQueuedMessages).not.toHaveBeenCalled();
  });

  it('emits client runtime start from the start lifecycle only for client runs', async () => {
    await runAgentRunLifecycle({
      context: { agentId: 'agent-1', threadId: 'thread-1', topicId: 'topic-1' } as any,
      operationId: 'op-1',
      parentMessageId: 'user-1',
      parentMessageType: 'user',
      phase: 'runStart',
      runtimeType: 'client',
    });
    await runAgentRunLifecycle({
      context: { agentId: 'agent-1', topicId: 'topic-1' } as any,
      operationId: 'op-2',
      phase: 'runStart',
      runtimeType: 'gateway',
    });

    expect(emitClientAgentSignalSourceEvent).toHaveBeenCalledTimes(1);
    expect(emitClientAgentSignalSourceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          operationId: 'op-1',
          parentMessageId: 'user-1',
          triggerMessageId: 'user-1',
        }),
        sourceId: 'op-1:client:start',
        sourceType: 'client.runtime.start',
      }),
    );
  });

  it('emits gateway event signals from the event lifecycle', async () => {
    await runAgentRunLifecycle({
      anchorMessageId: 'asst-1',
      assistantMessageId: 'asst-1',
      context: { agentId: 'agent-1', topicId: 'topic-1' } as any,
      eventType: 'stream_start',
      operationId: 'op-1',
      phase: 'runEvent',
      runtimeType: 'gateway',
      stepIndex: 2,
    });

    expect(emitClientAgentSignalSourceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          anchorMessageId: 'asst-1',
          assistantMessageId: 'asst-1',
          operationId: 'op-1',
          stepIndex: 2,
        }),
        sourceId: 'op-1:gateway:start:2',
        sourceType: 'client.gateway.stream_start',
      }),
    );
  });

  it('runs gateway operation cleanup from the operation lifecycle', async () => {
    const onComplete = vi.fn();
    const store = createStore();

    await runAgentRunLifecycle({
      context: { agentId: 'agent-1', groupId: 'group-1', topicId: 'topic-1' } as any,
      get: () => store,
      onComplete,
      operationId: 'op-1',
      phase: 'operationComplete',
      runtimeType: 'gateway',
    });

    expect(store.completeOperation).toHaveBeenCalledWith('op-1');
    expect(store.internal_updateTopicLoading).toHaveBeenCalledWith('topic-1', false);
    expect(store.updateTopicStatus).toHaveBeenCalledWith({
      agentId: 'agent-1',
      groupId: 'group-1',
      status: 'active',
      topicId: 'topic-1',
    });
    expect(topicService.updateTopicMetadata).toHaveBeenCalledWith('topic-1', {
      runningOperation: null,
    });
    expect(onComplete).toHaveBeenCalled();
  });

  it('runs client desktop notification as a client complete lifecycle effect', async () => {
    desktopEnv.isDesktop = true;
    const store = createStore({
      messagesMap: {
        'main_agent-1_topic-1': [
          { content: 'Finished **answer**', id: 'asst-1', role: 'assistant' },
        ],
      },
      topicDataMap: {
        'agent_agent-1': { items: [{ id: 'topic-1', title: 'Topic title' }] },
      },
    });

    await runAgentRunLifecycle({
      assistantMessageId: 'asst-1',
      context: { agentId: 'agent-1', topicId: 'topic-1' } as any,
      drainQueuedMessages: false,
      get: () => store,
      operationId: 'op-1',
      phase: 'runComplete',
      runtimeType: 'client',
      status: 'completed',
    });

    expect(desktopNotificationMock.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Finished answer',
        title: 'Topic title',
      }),
    );
  });
});
