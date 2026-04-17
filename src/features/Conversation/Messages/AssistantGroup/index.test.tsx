/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import GroupMessage from './index';

const mockToggleSystemRole = vi.fn();
const mockOpenChatSettings = vi.fn();
const mockDoubleClickEdit = vi.fn();

const mockItem = {
  agentId: 'agent-1',
  content: 'assistant-content',
  createdAt: 123,
  id: 'assistant-1',
  metadata: {
    reactions: [{ emoji: '👍', users: ['user-1'] }],
  },
  model: 'gpt-test',
  performance: { completionTokens: 1, promptTokens: 1, totalTokens: 2 },
  provider: 'openai',
  role: 'assistant',
  usage: { completionTokens: 1, promptTokens: 1, totalTokens: 2 },
} as any;

const mockConversationState = {
  addReaction: vi.fn(),
  displayMessages: [mockItem],
  removeReaction: vi.fn(),
};

vi.mock('@/features/Conversation/ChatItem', () => ({
  ChatItem: ({
    actions,
    children,
    customErrorRender,
    editing,
    loading,
    message,
    messageExtra,
    onDoubleClick,
  }: {
    actions?: ReactNode;
    children?: ReactNode;
    customErrorRender?: unknown;
    editing?: boolean;
    loading?: boolean;
    message?: ReactNode;
    messageExtra?: ReactNode;
    onDoubleClick?: unknown;
  }) => (
    <div
      data-editing={String(!!editing)}
      data-has-custom-error-render={String(!!customErrorRender)}
      data-has-double-click={String(!!onDoubleClick)}
      data-loading={String(!!loading)}
      data-message={String(message ?? '')}
      data-testid="chat-item"
    >
      <div data-testid="actions">{actions}</div>
      <div data-testid="children">{children}</div>
      <div data-testid="message-extra">{messageExtra}</div>
    </div>
  ),
}));

vi.mock('@/hooks/useInterceptingRoutes', () => ({
  useOpenChatSettings: () => mockOpenChatSettings,
}));

vi.mock('@/libs/next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: unknown) => unknown) => selector({}),
}));

vi.mock('@/store/agent/selectors', () => ({
  builtinAgentSelectors: {
    isInboxAgent: () => false,
  },
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: unknown) => unknown) =>
    selector({ toggleSystemRole: mockToggleSystemRole }),
}));

vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: unknown) => unknown) =>
    selector({
      config: { isDevMode: false },
      userId: 'user-1',
    }),
}));

vi.mock('@/store/user/selectors', () => ({
  userGeneralSettingsSelectors: {
    config: (state: any) => state.config,
  },
  userProfileSelectors: {
    userId: (state: any) => state.userId,
  },
}));

vi.mock('../../Error', () => ({
  __esModule: true,
  default: () => <div data-testid="error-message-extra" />,
  useErrorContent: () => undefined,
}));

vi.mock('../../hooks', () => ({
  useAgentMeta: () => ({ title: 'Agent' }),
  useDoubleClickEdit: () => mockDoubleClickEdit,
}));

vi.mock('../../store', () => ({
  dataSelectors: {
    getDisplayMessageById: (id: string) => (state: typeof mockConversationState) =>
      state.displayMessages.find((message) => message.id === id),
    getGroupLatestMessageWithoutTools: () => () => undefined,
  },
  messageStateSelectors: {
    isMessageCreating: () => () => false,
    isMessageEditing: () => () => false,
    isMessageGenerating: () => () => true,
    isMessageInterrupted: () => () => true,
  },
  useConversationStore: (selector: (state: typeof mockConversationState) => unknown) =>
    selector(mockConversationState),
}));

vi.mock('../../utils/markdown', () => ({
  normalizeThinkTags: (value: string) => value,
  processWithArtifact: (value: string) => value,
}));

vi.mock('../components/Extras/AssistantMessageExtra', () => ({
  AssistantMessageExtra: () => <div data-testid="assistant-message-extra" />,
}));

vi.mock('../components/InterruptedHint', () => ({
  default: () => <div data-testid="interrupted-hint" />,
}));

vi.mock('../components/Extras/Usage', () => ({
  default: () => <div data-testid="usage" />,
}));

vi.mock('../components/MessageBranch', () => ({
  default: () => <div data-testid="message-branch" />,
}));

vi.mock('../Contexts/message-action-context', () => ({
  useSetMessageItemActionElementPortialContext: () => vi.fn(),
  useSetMessageItemActionTypeContext: () => vi.fn(),
}));

vi.mock('../User/components/FileListViewer', () => ({
  default: () => <div data-testid="file-list-viewer" />,
}));

vi.mock('./components/Group', () => ({
  default: ({
    blocks,
    content,
    contentId,
  }: {
    blocks: Array<{ content: string; id: string }>;
    content?: string;
    contentId?: string;
  }) => (
    <div
      data-blocks={JSON.stringify(blocks)}
      data-content={content}
      data-content-id={contentId}
      data-testid="group"
    />
  ),
}));

vi.mock('../../components/Reaction', () => ({
  ReactionDisplay: () => <div data-testid="reaction-display" />,
}));

describe('AssistantGroupMessage', () => {
  it('supports single-block assistant messages without changing routing', () => {
    render(<GroupMessage id="assistant-1" index={0} />);

    const blocks = JSON.parse(screen.getByTestId('group').getAttribute('data-blocks') || '[]');

    expect(screen.getByTestId('chat-item')).toHaveAttribute('data-loading', 'true');
    expect(screen.getByTestId('chat-item')).toHaveAttribute('data-editing', 'false');
    expect(screen.getByTestId('chat-item')).toHaveAttribute(
      'data-has-custom-error-render',
      'true',
    );
    expect(screen.getByTestId('chat-item')).toHaveAttribute('data-has-double-click', 'true');
    expect(screen.getByTestId('chat-item')).toHaveAttribute(
      'data-message',
      'assistant-content',
    );

    expect(screen.getByTestId('group')).toHaveAttribute('data-content', 'assistant-content');
    expect(screen.getByTestId('group')).toHaveAttribute('data-content-id', 'assistant-1');
    expect(blocks).toEqual([
      {
        content: 'assistant-content',
        id: 'assistant-1',
        metadata: mockItem.metadata,
        performance: mockItem.performance,
        usage: mockItem.usage,
      },
    ]);

    expect(screen.getByTestId('assistant-message-extra')).toBeInTheDocument();
    expect(screen.getByTestId('interrupted-hint')).toBeInTheDocument();
    expect(screen.getByTestId('reaction-display')).toBeInTheDocument();
    expect(
      screen.getByTestId('actions').querySelector('[data-assitant-action-bar-portal]'),
    ).not.toBeNull();
    expect(
      screen.getByTestId('actions').querySelector('[data-assistant-group-action-bar-portal]'),
    ).toBeNull();
  });
});
