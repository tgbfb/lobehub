'use client';

import { Flexbox } from '@lobehub/ui';
import { debounce } from 'es-toolkit/compat';
import { memo, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { mutate } from 'swr';

import { AutoSaveHint } from '@/features/EditorCanvas';
import FloatingChatPanel from '@/features/FloatingChatPanel';
import TopicCanvas from '@/features/TopicCanvas';
import { useAutoCreateTopicDocument } from '@/features/TopicCanvas/useAutoCreateTopicDocument';
import { useClientDataSWR } from '@/libs/swr';
import HeaderSlot from '@/routes/(main)/agent/(chat)/_layout/HeaderSlot';
import { agentDocumentSWRKeys } from '@/services/agentDocument';
import { documentService } from '@/services/document';
import { useAgentStore } from '@/store/agent';
import { SWR_USE_FETCH_NOTEBOOK_DOCUMENTS } from '@/store/notebook/action';

const MAX_PANEL_WIDTH = 1024;
const TITLE_SAVE_DEBOUNCE = 500;

const TopicPage = memo(() => {
  const { aid, topicId, docId } = useParams<{ aid?: string; docId?: string; topicId?: string }>();
  const navigate = useNavigate();

  const agentId = useAgentStore((s) => s.activeAgentId);
  const { document: topicDocument } = useAutoCreateTopicDocument(topicId);

  const [titleDraft, setTitleDraft] = useState<string | undefined>();

  const {
    data: documentMeta,
    error: documentError,
    isLoading: isDocLoading,
  } = useClientDataSWR(docId ? ['page-document-meta', docId] : null, () =>
    documentService.getDocumentById(docId!),
  );

  const isInvalidDoc = docId && !isDocLoading && (documentError || documentMeta === null);

  useEffect(() => {
    if (!aid || !topicId) return;
    if (!isInvalidDoc) return;
    if (!topicDocument?.id) return;
    if (topicDocument.id === docId) return;
    navigate(`/agent/${aid}/${topicId}/page/${topicDocument.id}`, { replace: true });
  }, [aid, topicId, docId, isInvalidDoc, topicDocument?.id, navigate]);

  useEffect(() => {
    setTitleDraft(undefined);
  }, [docId]);

  const debouncedSaveTitle = useMemo(
    () =>
      debounce(
        async (
          id: string,
          nextTitle: string,
          ctx: { agentId: string | undefined; topicId: string | undefined },
        ) => {
          await documentService.updateDocument({
            id,
            saveSource: 'autosave',
            title: nextTitle,
          });
          if (ctx.agentId) await mutate(agentDocumentSWRKeys.documentsList(ctx.agentId));
          if (ctx.topicId) await mutate([SWR_USE_FETCH_NOTEBOOK_DOCUMENTS, ctx.topicId]);
          await mutate(['page-document-meta', id]);
        },
        TITLE_SAVE_DEBOUNCE,
      ),
    [],
  );

  const handleTitleChange = (next: string) => {
    setTitleDraft(next);
    if (docId) debouncedSaveTitle(docId, next, { agentId, topicId });
  };

  if (!aid || !topicId) return null;

  const displayTitle = titleDraft ?? documentMeta?.title ?? '';

  return (
    <Flexbox
      align={'center'}
      data-testid="agent-page-container"
      height={'100%'}
      style={{ minHeight: 0, minWidth: 0, position: 'relative' }}
      width={'100%'}
    >
      {docId && (
        <HeaderSlot>
          <AutoSaveHint documentId={docId} />
        </HeaderSlot>
      )}
      <Flexbox
        flex={1}
        style={{ maxWidth: MAX_PANEL_WIDTH, minHeight: 0, paddingBlockEnd: 16 }}
        width={'100%'}
      >
        <Flexbox flex={1} style={{ minHeight: 0 }} width={'100%'}>
          <TopicCanvas
            agentId={aid}
            documentId={docId}
            title={displayTitle}
            topicId={topicId}
            onTitleChange={handleTitleChange}
          />
        </Flexbox>
        <FloatingChatPanel
          agentId={aid}
          maxHeight={0.92}
          minHeight={320}
          title={'Floating Chat Panel'}
          topicId={topicId}
          variant={'embedded'}
        />
      </Flexbox>
    </Flexbox>
  );
});

export default TopicPage;
