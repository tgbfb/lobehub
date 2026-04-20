/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import TopicPage from './index';

const useParamsMock = vi.hoisted(() => vi.fn());
const useNavigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = (await vi.importActual('react-router-dom')) as typeof import('react-router-dom');

  return {
    ...actual,
    useNavigate: () => useNavigateMock,
    useParams: useParamsMock,
  };
});

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('@/libs/swr', () => ({
  useClientDataSWR: () => ({ data: null, error: undefined, isLoading: false }),
}));

vi.mock('@/services/document', () => ({
  documentService: {
    getDocumentById: vi.fn(),
    updateDocument: vi.fn(),
  },
}));

vi.mock('@/services/agentDocument', () => ({
  agentDocumentSWRKeys: { documentsList: (id: string) => ['agent-documents-list', id] },
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (s: { activeAgentId?: string }) => unknown) =>
    selector({ activeAgentId: 'agt_test' }),
}));

vi.mock('@/store/notebook/action', () => ({
  SWR_USE_FETCH_NOTEBOOK_DOCUMENTS: 'SWR_USE_FETCH_NOTEBOOK_DOCUMENTS',
}));

vi.mock('@/features/TopicCanvas/useAutoCreateTopicDocument', () => ({
  useAutoCreateTopicDocument: () => ({ document: undefined, isLoading: false }),
}));

vi.mock('@lobehub/ui', () => ({
  Flexbox: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock('@/features/FloatingChatPanel', () => ({
  default: ({
    agentId,
    open,
    title,
    topicId,
    variant,
  }: {
    agentId: string;
    open?: boolean;
    title?: string;
    topicId: string | null;
    variant?: string;
  }) => (
    <div
      data-agent-id={agentId}
      data-open={String(open)}
      data-testid="floating-chat-panel"
      data-title={title ?? ''}
      data-topic-id={topicId ?? 'null'}
      data-variant={variant ?? ''}
    />
  ),
}));

vi.mock('@/features/TopicCanvas', () => ({
  default: ({
    agentId,
    documentId,
    topicId,
  }: {
    agentId?: string;
    documentId?: string;
    topicId?: string | null;
  }) => (
    <div
      data-agent-id={agentId ?? ''}
      data-document-id={documentId ?? ''}
      data-testid="topic-canvas"
      data-topic-id={topicId ?? 'null'}
    />
  ),
}));

describe('Topic page route', () => {
  it('renders FloatingChatPanel with route topic context', () => {
    useParamsMock.mockReturnValue({
      aid: 'agt_test',
      docId: 'doc_test',
      topicId: 'tpc_test',
    });

    render(<TopicPage />);

    expect(screen.getByTestId('agent-page-container')).toBeInTheDocument();
    expect(screen.getByTestId('topic-canvas')).toHaveAttribute('data-agent-id', 'agt_test');
    expect(screen.getByTestId('topic-canvas')).toHaveAttribute('data-topic-id', 'tpc_test');
    expect(screen.getByTestId('topic-canvas')).toHaveAttribute('data-document-id', 'doc_test');
    expect(screen.getByTestId('floating-chat-panel')).toHaveAttribute('data-agent-id', 'agt_test');
    expect(screen.getByTestId('floating-chat-panel')).toHaveAttribute(
      'data-title',
      'Floating Chat Panel',
    );
    expect(screen.getByTestId('floating-chat-panel')).toHaveAttribute('data-topic-id', 'tpc_test');
    expect(screen.getByTestId('floating-chat-panel')).toHaveAttribute('data-variant', 'embedded');
  });

  it('returns null when aid or topicId is missing', () => {
    useParamsMock.mockReturnValue({ aid: 'agt_test' });

    const { container } = render(<TopicPage />);

    expect(container).toBeEmptyDOMElement();
  });
});
