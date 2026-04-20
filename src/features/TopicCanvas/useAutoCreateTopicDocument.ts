'use client';

import type { NotebookDocument } from '@lobechat/types';
import { useEffect } from 'react';

import { notebookSelectors, useNotebookStore } from '@/store/notebook';

interface UseAutoCreateTopicDocumentResult {
  document: NotebookDocument | undefined;
  isLoading: boolean;
}

const inflight = new Map<string, Promise<unknown>>();

/**
 * Fetch the topic-scoped notebook document for a topic; auto-create one when
 * the list is empty. Returns the first document (topic → page is 1:1 in practice).
 *
 * Deduplicates concurrent creations across component instances via a module-level
 * promise map keyed by topicId.
 */
export const useAutoCreateTopicDocument = (
  topicId: string | undefined,
): UseAutoCreateTopicDocumentResult => {
  const useFetchDocuments = useNotebookStore((s) => s.useFetchDocuments);
  const createDocument = useNotebookStore((s) => s.createDocument);

  const { isLoading } = useFetchDocuments(topicId);
  const documents = useNotebookStore(notebookSelectors.getDocumentsByTopicId(topicId));

  useEffect(() => {
    if (!topicId || isLoading) return;
    if (documents.length > 0) return;
    if (inflight.has(topicId)) return;

    const promise = createDocument({
      content: '',
      description: '',
      title: '',
      topicId,
      type: 'markdown',
    })
      .catch((error) => {
        console.error('[TopicCanvas] Failed to auto-create topic document:', error);
      })
      .finally(() => {
        inflight.delete(topicId);
      });

    inflight.set(topicId, promise);
  }, [topicId, isLoading, documents.length, createDocument]);

  return {
    document: documents[0],
    isLoading,
  };
};
