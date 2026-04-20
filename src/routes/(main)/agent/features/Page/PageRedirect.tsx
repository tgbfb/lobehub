'use client';

import { memo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import BrandTextLoading from '@/components/Loading/BrandTextLoading';
import { useAutoCreateTopicDocument } from '@/features/TopicCanvas/useAutoCreateTopicDocument';

const PageRedirect = memo(() => {
  const { aid, topicId } = useParams<{ aid?: string; topicId?: string }>();
  const navigate = useNavigate();

  const { document } = useAutoCreateTopicDocument(topicId);

  useEffect(() => {
    if (!aid || !topicId || !document?.id) return;
    navigate(`/agent/${aid}/${topicId}/page/${document.id}`, { replace: true });
  }, [aid, topicId, document?.id, navigate]);

  return <BrandTextLoading debugId={'PageRedirect'} />;
});

PageRedirect.displayName = 'PageRedirect';

export default PageRedirect;
