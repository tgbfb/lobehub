import { act, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetFloatingChatPanelRegistry } from './guard';
import FloatingChatPanel from './index';

vi.mock('./ChatBody', () => ({
  default: () => <div data-testid="chat-body">body</div>,
}));

const sheetHandlers = vi.hoisted(() => ({
  current: {
    onOpenChange: undefined as ((open: boolean) => void) | undefined,
    onSnapPointChange: undefined as ((point: number) => void) | undefined,
  },
}));

vi.mock('@lobehub/ui/base-ui', () => ({
  FloatingSheet: ({
    children,
    dismissible,
    headerActions,
    open,
    activeSnapPoint,
    snapPoints,
    title,
    variant,
    onOpenChange,
    onSnapPointChange,
  }: {
    activeSnapPoint?: number;
    children: ReactNode;
    dismissible?: boolean;
    headerActions?: ReactNode;
    onOpenChange?: (open: boolean) => void;
    onSnapPointChange?: (point: number) => void;
    open?: boolean;
    snapPoints?: number[];
    title?: ReactNode;
    variant?: string;
  }) => {
    sheetHandlers.current.onOpenChange = onOpenChange;
    sheetHandlers.current.onSnapPointChange = onSnapPointChange;
    return (
      <div
        data-active-snap={activeSnapPoint}
        data-dismissible={String(dismissible)}
        data-open={String(open)}
        data-snap-points={JSON.stringify(snapPoints ?? [])}
        data-testid="floating-panel-shell"
        data-variant={variant ?? ''}
      >
        <div data-testid="sheet-title">{title}</div>
        <div data-testid="sheet-actions">{headerActions}</div>
        {children}
      </div>
    );
  },
}));

vi.mock('@lobehub/ui', () => ({
  ActionIcon: ({
    onClick,
    title,
    ...rest
  }: {
    onClick?: () => void;
    title?: string;
    [key: string]: unknown;
  }) => (
    <button
      data-testid={(rest as any)['data-testid']}
      title={title}
      type="button"
      onClick={onClick}
    >
      {title}
    </button>
  ),
  Icon: ({ icon }: { icon: () => void }) => <span data-icon={icon.name} />,
}));

const mergedHooksCaptured = vi.hoisted(() => ({
  current: undefined as undefined | { onBeforeSendMessage?: () => Promise<void> },
}));

vi.mock('@/features/Conversation', () => ({
  ChatInput: ({
    compact,
    leftActions,
    rightActions,
    showControlBar,
  }: {
    compact?: boolean;
    leftActions?: string[];
    rightActions?: string[];
    showControlBar?: boolean;
  }) => (
    <div
      data-compact={String(compact ?? false)}
      data-left-actions={JSON.stringify(leftActions ?? [])}
      data-right-actions={JSON.stringify(rightActions ?? [])}
      data-show-control-bar={String(showControlBar ?? true)}
      data-testid="chat-input"
    />
  ),
  ChatList: () => null,
  ConversationProvider: ({ children, context, hooks }: any) => {
    mergedHooksCaptured.current = hooks;
    return (
      <div data-context={JSON.stringify(context)} data-testid="provider">
        {children}
      </div>
    );
  },
}));

vi.mock('@/routes/(main)/agent/features/Conversation/useActionsBarConfig', () => ({
  useActionsBarConfig: () => ({ assistant: {}, user: {} }),
}));

vi.mock('@/hooks/useOperationState', () => ({
  useOperationState: () => undefined,
}));

vi.mock('@/features/Conversation/hooks/useChatFollowUp', () => ({
  useChatFollowUp: () => ({}),
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: () => undefined,
}));

vi.mock('@/store/agent/selectors', () => ({
  chatConfigByIdSelectors: {
    getChatConfigById: () => () => undefined,
  },
}));

const mockChatState = vi.hoisted(() => ({
  current: {
    dbMessagesMap: {} as Record<string, Array<{ id: string; threadId?: string | null }>>,
    portalThreadId: undefined as string | undefined,
    replaceMessages: vi.fn(),
  },
}));

vi.mock('@/store/chat', () => {
  const useChatStore: any = (selector: any) => selector(mockChatState.current);
  useChatStore.getState = () => mockChatState.current;
  useChatStore.setState = (patch: any) => {
    Object.assign(
      mockChatState.current,
      typeof patch === 'function' ? patch(mockChatState.current) : patch,
    );
  };
  return { useChatStore };
});

vi.mock('@/store/chat/utils/messageMapKey', () => ({
  messageMapKey: (ctx: any) => `${ctx.agentId}:${ctx.topicId}:${ctx.threadId}`,
}));

describe('FloatingChatPanel', () => {
  beforeEach(() => {
    __resetFloatingChatPanelRegistry();
    mockChatState.current.dbMessagesMap = {};
    mockChatState.current.portalThreadId = undefined;
    sheetHandlers.current.onOpenChange = undefined;
    sheetHandlers.current.onSnapPointChange = undefined;
    mergedHooksCaptured.current = undefined;
  });

  it('builds an ephemeral thread context by default from agentId + topicId', () => {
    const { getByTestId } = render(<FloatingChatPanel agentId="agent-1" topicId="topic-1" />);
    const ctx = JSON.parse(getByTestId('provider').dataset.context!);
    expect(ctx).toEqual({
      agentId: 'agent-1',
      isNew: true,
      scope: 'thread',
      threadId: null,
      topicId: 'topic-1',
    });
  });

  it('drops isNew when an existing threadId is supplied', () => {
    const { getByTestId } = render(
      <FloatingChatPanel agentId="agent-1" threadId="thread-1" topicId="topic-1" />,
    );
    const ctx = JSON.parse(getByTestId('provider').dataset.context!);
    expect(ctx).toEqual({
      agentId: 'agent-1',
      scope: 'thread',
      threadId: 'thread-1',
      topicId: 'topic-1',
    });
  });

  it('builds a main-scope context when scope is forced to main', () => {
    const { getByTestId } = render(
      <FloatingChatPanel agentId="agent-1" scope="main" topicId="topic-1" />,
    );
    const ctx = JSON.parse(getByTestId('provider').dataset.context!);
    expect(ctx).toEqual({
      agentId: 'agent-1',
      scope: 'main',
      threadId: null,
      topicId: 'topic-1',
    });
  });

  it('anchors a new thread on the topic last main message when one is present', () => {
    mockChatState.current.dbMessagesMap = {
      'agent-1:topic-1:undefined': [
        { id: 'msg-1', threadId: null },
        { id: 'msg-2', threadId: null },
      ],
    };

    const { getByTestId } = render(<FloatingChatPanel agentId="agent-1" topicId="topic-1" />);
    const ctx = JSON.parse(getByTestId('provider').dataset.context!);
    expect(ctx).toEqual({
      agentId: 'agent-1',
      isNew: true,
      scope: 'thread',
      sourceMessageId: 'msg-2',
      threadId: null,
      threadType: 'standalone',
      topicId: 'topic-1',
    });
  });

  it('skips thread-scoped rows when picking the source message anchor', () => {
    mockChatState.current.dbMessagesMap = {
      'agent-1:topic-1:undefined': [
        { id: 'msg-1', threadId: null },
        { id: 'msg-2', threadId: null },
        { id: 'msg-3', threadId: 'thread-x' },
      ],
    };

    const { getByTestId } = render(<FloatingChatPanel agentId="agent-1" topicId="topic-1" />);
    const ctx = JSON.parse(getByTestId('provider').dataset.context!);
    expect(ctx.sourceMessageId).toBe('msg-2');
  });

  it('forwards documentId into the conversation context for document-aware injection', () => {
    const { getByTestId } = render(
      <FloatingChatPanel agentId="agent-1" documentId="doc-1" topicId="topic-1" />,
    );
    const ctx = JSON.parse(getByTestId('provider').dataset.context!);
    expect(ctx).toEqual({
      agentId: 'agent-1',
      documentId: 'doc-1',
      isNew: true,
      scope: 'thread',
      threadId: null,
      topicId: 'topic-1',
    });
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
    expect(getByTestId('sheet-actions').textContent).toContain('Action');
  });

  it('starts collapsed and ships a seamless dismissible sheet with two snap points', () => {
    const { getByTestId } = render(<FloatingChatPanel agentId="a" topicId="t" />);
    const sheet = getByTestId('floating-panel-shell');
    expect(sheet.dataset.snapPoints).toBe(JSON.stringify([420, 800]));
    expect(sheet.dataset.variant).toBe('elevated');
    expect(sheet.dataset.dismissible).toBe('true');
    expect(sheet.dataset.open).toBe('false');
    expect(sheet.dataset.activeSnap).toBe('420');
    expect(getByTestId('floating-chat-panel').dataset.collapsed).toBe('true');
  });

  it('renders a minimal ChatInput while collapsed (no left/right actions)', () => {
    const { getByTestId } = render(<FloatingChatPanel agentId="a" topicId="t" />);
    const input = getByTestId('chat-input');
    expect(input.dataset.leftActions).toBe('[]');
    expect(input.dataset.rightActions).toBe('[]');
  });

  it('expands to the mid snap when the Send hook fires', async () => {
    const { getByTestId } = render(<FloatingChatPanel agentId="a" topicId="t" />);
    expect(getByTestId('floating-panel-shell').dataset.open).toBe('false');

    await act(async () => {
      await mergedHooksCaptured.current?.onBeforeSendMessage?.();
    });

    const sheet = getByTestId('floating-panel-shell');
    expect(sheet.dataset.open).toBe('true');
    expect(sheet.dataset.activeSnap).toBe('420');
    expect(getByTestId('floating-chat-panel').dataset.collapsed).toBe('false');
    const input = getByTestId('chat-input');
    expect(input.dataset.leftActions).toBe(JSON.stringify(['typo']));
    expect(input.dataset.rightActions).toBe(JSON.stringify(['contextWindow']));
  });

  it('collapses back when the sheet reports onOpenChange(false)', async () => {
    const { getByTestId } = render(<FloatingChatPanel agentId="a" topicId="t" />);

    await act(async () => {
      await mergedHooksCaptured.current?.onBeforeSendMessage?.();
    });
    expect(getByTestId('floating-panel-shell').dataset.open).toBe('true');

    act(() => {
      sheetHandlers.current.onOpenChange?.(false);
    });

    expect(getByTestId('floating-panel-shell').dataset.open).toBe('false');
    expect(getByTestId('floating-chat-panel').dataset.collapsed).toBe('true');
    expect(getByTestId('floating-panel-shell').dataset.activeSnap).toBe('420');
  });

  it('expands when the header collapse button is clicked from expanded state', async () => {
    const { getByTestId } = render(<FloatingChatPanel agentId="a" topicId="t" />);

    await act(async () => {
      await mergedHooksCaptured.current?.onBeforeSendMessage?.();
    });
    expect(getByTestId('floating-chat-panel').dataset.collapsed).toBe('false');

    fireEvent.click(getByTestId('floating-chat-panel-collapse-button'));
    expect(getByTestId('floating-chat-panel').dataset.collapsed).toBe('true');
  });

  it('expands via the hover bar expand button', () => {
    const { getByTestId } = render(<FloatingChatPanel agentId="a" topicId="t" />);
    expect(getByTestId('floating-chat-panel').dataset.collapsed).toBe('true');

    fireEvent.click(getByTestId('floating-chat-panel-expand-button'));
    expect(getByTestId('floating-chat-panel').dataset.collapsed).toBe('false');
    expect(getByTestId('floating-panel-shell').dataset.activeSnap).toBe('420');
  });

  it('reflects user-driven snap changes through onSnapPointChange', async () => {
    const { getByTestId } = render(<FloatingChatPanel agentId="a" topicId="t" />);

    await act(async () => {
      await mergedHooksCaptured.current?.onBeforeSendMessage?.();
    });
    expect(getByTestId('floating-panel-shell').dataset.activeSnap).toBe('420');

    act(() => {
      sheetHandlers.current.onSnapPointChange?.(800);
    });
    expect(getByTestId('floating-panel-shell').dataset.activeSnap).toBe('800');
  });

  it('keeps the ChatInput element identity stable across state changes', async () => {
    const { getByTestId } = render(<FloatingChatPanel agentId="a" topicId="t" />);
    const beforeNode = getByTestId('chat-input');

    await act(async () => {
      await mergedHooksCaptured.current?.onBeforeSendMessage?.();
    });
    const afterExpand = getByTestId('chat-input');
    expect(afterExpand).toBe(beforeNode);

    act(() => {
      sheetHandlers.current.onOpenChange?.(false);
    });
    const afterCollapse = getByTestId('chat-input');
    expect(afterCollapse).toBe(beforeNode);
  });
});
