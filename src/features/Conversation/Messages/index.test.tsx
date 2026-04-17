/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import MessageItem from './index';

const mockMessage = {
  content: 'assistant-content',
  id: 'assistant-1',
  role: 'assistant',
} as const;

vi.mock('@lobechat/const', () => ({
  isDesktop: false,
}));

vi.mock('@lobehub/ui', () => ({
  Flexbox: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
}));

vi.mock('antd-style', () => ({
  createStaticStyles: () => ({
    loading: 'loading',
    message: 'message',
  }),
  cx: (...classNames: Array<string | false | null | undefined>) =>
    classNames.filter(Boolean).join(' '),
}));

vi.mock('../components/History', () => ({
  default: () => <div data-testid="history" />,
}));

vi.mock('../hooks/useChatItemContextMenu', () => ({
  useChatItemContextMenu: () => ({
    handleContextMenu: vi.fn(),
  }),
}));

vi.mock('../store', () => ({
  dataSelectors: {
    getDisplayMessageById: (id: string) => () => (id === mockMessage.id ? mockMessage : undefined),
  },
  messageStateSelectors: {
    isMessageCreating: () => () => false,
    isMessageEditing: () => () => false,
  },
  useConversationStore: (selector: (state: unknown) => unknown) =>
    selector({ context: { topicId: null } }),
}));

vi.mock('./AgentCouncil', () => ({
  default: () => <div data-testid="agent-council" />,
}));

vi.mock('./AssistantGroup', () => ({
  default: () => <div data-testid="assistant-group-message" />,
}));

vi.mock('./CompressedGroup', () => ({
  default: () => <div data-testid="compressed-group-message" />,
}));

vi.mock('./GroupTasks', () => ({
  default: () => <div data-testid="group-tasks-message" />,
}));

vi.mock('./Supervisor', () => ({
  default: () => <div data-testid="supervisor-message" />,
}));

vi.mock('./Task', () => ({
  default: () => <div data-testid="task-message" />,
}));

vi.mock('./Tasks', () => ({
  default: () => <div data-testid="tasks-message" />,
}));

vi.mock('./Tool', () => ({
  default: () => <div data-testid="tool-message" />,
}));

vi.mock('./User', () => ({
  default: () => <div data-testid="user-message" />,
}));

vi.mock('@/components/BubblesLoading', () => ({
  default: () => <div data-testid="bubbles-loading" />,
}));

vi.mock('@/components/ErrorBoundary', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

describe('MessageItem', () => {
  it('routes assistant messages through AssistantGroupMessage', () => {
    render(<MessageItem id="assistant-1" index={0} />);

    expect(screen.getByTestId('assistant-group-message')).toBeInTheDocument();
  });
});
