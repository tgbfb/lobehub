import { useClientDataSWR } from '@/libs/swr';
import { agentDocumentService, agentDocumentSWRKeys } from '@/services/agentDocument';

/**
 * Resolve the doc-anchored chat topic for an `(agentId, documentId)` pair.
 *
 * Backed by `agentDocument.getOrCreateChatTopic`, which is idempotent and
 * marks the topic with `trigger='document'` so it is filtered out of the
 * regular chat sidebar. The first call provisions the topic + the
 * `topic_documents` association; subsequent calls return the same topic id.
 *
 * Returns `topicId: undefined` until the request resolves; callers should gate
 * rendering on a non-undefined value to avoid mounting a chat panel without a
 * topic anchor.
 */
export const useDocumentChatTopic = (params: {
  agentId: string | undefined;
  documentId: string | undefined;
}) => {
  const { agentId, documentId } = params;
  const { data, error, isLoading } = useClientDataSWR(
    agentId && documentId ? agentDocumentSWRKeys.documentChatTopic(agentId, documentId) : null,
    () =>
      agentDocumentService.getOrCreateChatTopic({
        agentId: agentId!,
        documentId: documentId!,
      }),
  );

  return { error, isLoading, topicId: data?.topicId };
};
