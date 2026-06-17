/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AgentDocumentPage from './index';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ aid: 'agent-from-url' }),
}));

vi.mock('@lobehub/ui', () => ({
  Flexbox: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...(props as Record<string, unknown>)}>{children}</div>
  ),
}));

vi.mock('@/features/PageEditor', () => ({
  PageEditor: ({ pageId, header }: { header?: ReactNode; pageId?: string }) => (
    <div data-page-id={pageId} data-testid="page-editor">
      {header}
    </div>
  ),
}));

vi.mock('@/features/WideScreenContainer', () => ({
  default: ({ children }: { children?: ReactNode }) => (
    <div data-testid="wide-screen-container">{children}</div>
  ),
}));

vi.mock('./Header', () => ({
  default: ({ documentId }: { documentId?: string }) => (
    <div data-document-id={documentId} data-testid="header" />
  ),
}));

vi.mock('./useAgentDocumentItem', () => ({
  useAgentDocumentItem: () => ({
    item: { filename: 'spec.md', id: 'agent-document-1', title: 'Spec' },
    mutate: vi.fn(),
  }),
}));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => vi.fn(),
}));

const panelProps = vi.hoisted(() => ({
  current: undefined as undefined | Record<string, unknown>,
}));

vi.mock('@/features/FloatingChatPanel', () => ({
  default: (props: Record<string, unknown>) => {
    panelProps.current = props;
    return <div data-testid="floating-chat-panel" />;
  },
}));

const mockAgentState = vi.hoisted(() => ({
  current: { activeAgentId: 'active-agent' },
}));
vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: any) => selector(mockAgentState.current),
}));

const mockChatState = vi.hoisted(() => ({
  current: { activeTopicId: 'topic-1' },
}));
vi.mock('@/store/chat', () => ({
  useChatStore: (selector: any) => selector(mockChatState.current),
}));

const mockUserState = vi.hoisted(() => ({
  current: {
    preference: { lab: { enableAgentDocumentFloatingChatPanel: false } },
  },
}));
vi.mock('@/store/user', () => ({
  useUserStore: (selector: any) => selector(mockUserState.current),
}));

vi.mock('@/store/user/selectors', () => ({
  labPreferSelectors: {
    enableAgentDocumentFloatingChatPanel: (s: any) =>
      s.preference.lab.enableAgentDocumentFloatingChatPanel,
  },
}));

describe('AgentDocumentPage', () => {
  beforeEach(() => {
    mockAgentState.current.activeAgentId = 'active-agent';
    mockChatState.current.activeTopicId = 'topic-1';
    mockUserState.current.preference.lab.enableAgentDocumentFloatingChatPanel = false;
    panelProps.current = undefined;
  });

  afterEach(() => {
    panelProps.current = undefined;
  });

  it('renders the PageEditor wired to the supplied documentId', () => {
    render(<AgentDocumentPage documentId="docs_abc" />);
    expect(screen.getByTestId('page-editor').dataset.pageId).toBe('docs_abc');
    expect(screen.getByTestId('header').dataset.documentId).toBe('docs_abc');
  });

  it('does not render FloatingChatPanel when the lab feature is disabled', () => {
    render(<AgentDocumentPage documentId="docs_abc" />);
    expect(screen.queryByTestId('floating-chat-panel')).toBeNull();
  });

  it('renders FloatingChatPanel inside a width-clamped container below the editor', () => {
    mockUserState.current.preference.lab.enableAgentDocumentFloatingChatPanel = true;
    render(<AgentDocumentPage documentId="docs_abc" />);

    const container = screen.getByTestId('wide-screen-container');
    const panel = screen.getByTestId('floating-chat-panel');
    expect(container).toContainElement(panel);
    expect(panelProps.current).toMatchObject({
      agentDocumentId: 'agent-document-1',
      agentId: 'active-agent',
      documentId: 'docs_abc',
      topicId: 'topic-1',
    });
  });

  it('skips the panel when no active agent is set even if the lab feature is enabled', () => {
    mockUserState.current.preference.lab.enableAgentDocumentFloatingChatPanel = true;
    mockAgentState.current.activeAgentId = undefined as unknown as string;
    render(<AgentDocumentPage documentId="docs_abc" />);
    expect(screen.queryByTestId('floating-chat-panel')).toBeNull();
  });
});
