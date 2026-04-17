import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetFloatingChatPanelRegistry } from './guard';
import FloatingChatPanel from './index';

vi.mock('./ChatBody', () => ({
  default: () => <div data-testid="chat-body">body</div>,
}));

vi.mock('@/features/Conversation', () => ({
  ChatList: () => null,
  ConversationProvider: ({ children, context }: any) => (
    <div data-context={JSON.stringify(context)} data-testid="provider">
      {children}
    </div>
  ),
}));

vi.mock('@/routes/(main)/agent/features/Conversation/useActionsBarConfig', () => ({
  useActionsBarConfig: () => ({ assistant: {}, user: {} }),
}));

vi.mock('@/hooks/useOperationState', () => ({
  useOperationState: () => undefined,
}));

vi.mock('@/store/chat', () => ({
  useChatStore: (selector: any) =>
    selector({
      dbMessagesMap: {},
      replaceMessages: vi.fn(),
    }),
}));

vi.mock('@/store/chat/utils/messageMapKey', () => ({
  messageMapKey: (ctx: any) => `${ctx.agentId}:${ctx.topicId}:${ctx.threadId}`,
}));

describe('FloatingChatPanel', () => {
  beforeEach(() => {
    __resetFloatingChatPanelRegistry();
  });

  it('builds a main-scope context from agentId + topicId', () => {
    const { getByTestId } = render(<FloatingChatPanel agentId="agent-1" topicId="topic-1" />);
    const ctx = JSON.parse(getByTestId('provider').dataset.context!);
    expect(ctx).toEqual({
      agentId: 'agent-1',
      scope: 'main',
      threadId: null,
      topicId: 'topic-1',
    });
  });

  it('switches scope to thread when threadId is provided', () => {
    const { getByTestId } = render(
      <FloatingChatPanel agentId="agent-1" threadId="thread-1" topicId="topic-1" />,
    );
    const ctx = JSON.parse(getByTestId('provider').dataset.context!);
    expect(ctx.scope).toBe('thread');
    expect(ctx.threadId).toBe('thread-1');
  });

  it('forwards title and headerActions to floating panel header', () => {
    const { getByTestId } = render(
      <FloatingChatPanel
        agentId="a"
        headerActions={<button>Action</button>}
        title={<span>My Title</span>}
        topicId="t"
      />,
    );
    expect(getByTestId('sheet-title').textContent).toBe('My Title');
    expect(getByTestId('sheet-actions').textContent).toBe('Action');
  });

  it('applies default shell props', () => {
    const { getByTestId } = render(<FloatingChatPanel agentId="a" topicId="t" />);
    const sheet = getByTestId('floating-panel-shell');
    expect(sheet.dataset.snapPoints).toBe(JSON.stringify([0.5, 0.9]));
    expect(sheet.dataset.variant).toBe('elevated');
    expect(sheet.dataset.dismissible).toBe('false');
  });
});
