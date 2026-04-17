'use client';

import { LOADING_FLAT } from '@lobechat/const';
import type { AssistantContentBlock, EmojiReaction, UIChatMessage } from '@lobechat/types';
import isEqual from 'fast-deep-equal';
import type { MouseEventHandler } from 'react';
import { memo, Suspense, useCallback, useMemo } from 'react';

import { MESSAGE_ACTION_BAR_PORTAL_ATTRIBUTES } from '@/const/messageActionPortal';
import { ChatItem } from '@/features/Conversation/ChatItem';
import { useOpenChatSettings } from '@/hooks/useInterceptingRoutes';
import dynamic from '@/libs/next/dynamic';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { useGlobalStore } from '@/store/global';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors, userProfileSelectors } from '@/store/user/selectors';

import ErrorMessageExtra, { useErrorContent } from '../../Error';
import { ReactionDisplay } from '../../components/Reaction';
import { useAgentMeta, useDoubleClickEdit } from '../../hooks';
import { dataSelectors, messageStateSelectors, useConversationStore } from '../../store';
import { normalizeThinkTags, processWithArtifact } from '../../utils/markdown';
import Usage from '../components/Extras/Usage';
import { AssistantMessageExtra } from '../components/Extras/AssistantMessageExtra';
import InterruptedHint from '../components/InterruptedHint';
import MessageBranch from '../components/MessageBranch';
import {
  useSetMessageItemActionElementPortialContext,
  useSetMessageItemActionTypeContext,
} from '../Contexts/message-action-context';
import FileListViewer from '../User/components/FileListViewer';
import Group from './components/Group';

const EditState = dynamic(() => import('./components/EditState'), {
  ssr: false,
});

interface GroupMessageProps {
  defaultWorkflowExpanded?: boolean;
  disableEditing?: boolean;
  id: string;
  index: number;
  isLatestItem?: boolean;
}

const createActionBarHolder = (actionBarPortalAttribute: string) => (
  <div {...{ [actionBarPortalAttribute]: '' }} style={{ height: '28px' }} />
);

const synthesizeSingleBlock = (item: UIChatMessage): AssistantContentBlock[] => {
  if (item.role === 'assistantGroup') return item.children ?? [];

  const block: AssistantContentBlock = {
    content: item.content || '',
    id: item.id,
  };

  if (item.error) block.error = item.error;
  if (item.chunksList?.length) block.chunksList = item.chunksList;
  if (item.reasoning) block.reasoning = item.reasoning;
  if (item.search) block.search = item.search;
  if (item.imageList?.length) block.imageList = item.imageList;
  if (item.fileList?.length) block.fileList = item.fileList;
  if (item.tools?.length) block.tools = item.tools;
  if (item.usage) block.usage = item.usage;
  if (item.performance) block.performance = item.performance;
  if (item.metadata) block.metadata = item.metadata;

  return [block];
};

const GroupMessage = memo<GroupMessageProps>(
  ({ defaultWorkflowExpanded, id, index, disableEditing }) => {
    // Get message and actionsConfig from ConversationStore
    const item = useConversationStore(dataSelectors.getDisplayMessageById(id), isEqual)!;

    const {
      agentId,
      usage,
      createdAt,
      performance,
      model,
      provider,
      branch,
      metadata,
      error,
      role,
      content,
      extra,
      tools,
    } = item;
    const avatar = useAgentMeta(agentId);
    const isSingleBlockMode = item.role === 'assistant';
    const blocks = useMemo(() => synthesizeSingleBlock(item), [item]);

    // Collect fileList from all children blocks
    const aggregatedFileList = useMemo(() => {
      if (blocks.length === 0) return [];
      return blocks.flatMap((child: AssistantContentBlock) => child.fileList || []);
    }, [blocks]);

    const isInbox = useAgentStore(builtinAgentSelectors.isInboxAgent);
    const [toggleSystemRole] = useGlobalStore((s) => [s.toggleSystemRole]);
    const openChatSettings = useOpenChatSettings();

    // Get the latest message block from the group that doesn't contain tools
    const lastAssistantMsg = useConversationStore(
      dataSelectors.getGroupLatestMessageWithoutTools(id),
    );

    const contentId = isSingleBlockMode ? item.id : lastAssistantMsg?.id;

    // Get editing and interrupted state from ConversationStore
    const editing = useConversationStore(messageStateSelectors.isMessageEditing(contentId || ''));
    const generating = useConversationStore(
      messageStateSelectors.isMessageGenerating(contentId || ''),
    );
    const isCreating = useConversationStore(messageStateSelectors.isMessageCreating(contentId || ''));
    // Check interrupted on both the group root and the active block, because
    // continuation runs attach their operations to lastBlockId (contentId),
    // not the group root.
    const groupInterrupted = useConversationStore(messageStateSelectors.isMessageInterrupted(id));
    const blockInterrupted = useConversationStore(
      messageStateSelectors.isMessageInterrupted(contentId || ''),
    );
    const interrupted = groupInterrupted || blockInterrupted;

    const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);
    const addReaction = useConversationStore((s) => s.addReaction);
    const removeReaction = useConversationStore((s) => s.removeReaction);
    const userId = useUserStore(userProfileSelectors.userId)!;
    const reactions: EmojiReaction[] = metadata?.reactions || [];
    const errorContent = useErrorContent(error);
    const shouldForceShowError =
      error?.type === 'ProviderBizError' &&
      (error?.body as any)?.provider === 'google' &&
      !!(
        (error?.body as any)?.context?.promptFeedback?.blockReason ||
        (error?.body as any)?.context?.finishReason
      );
    const message = !editing ? normalizeThinkTags(processWithArtifact(content)) : content;
    const onDoubleClick = useDoubleClickEdit({
      disableEditing,
      error,
      id: contentId || id,
      role,
    });
    const actionType = isSingleBlockMode ? 'assistant' : 'assistantGroup';
    const actionBarPortalAttribute = isSingleBlockMode
      ? MESSAGE_ACTION_BAR_PORTAL_ATTRIBUTES.assistant
      : MESSAGE_ACTION_BAR_PORTAL_ATTRIBUTES.assistantGroup;

    const handleReactionClick = useCallback(
      (emoji: string) => {
        const existing = reactions.find((r) => r.emoji === emoji);
        if (existing && existing.users.includes(userId)) {
          removeReaction(id, emoji);
        } else {
          addReaction(id, emoji);
        }
      },
      [id, reactions, addReaction, removeReaction],
    );

    const isReactionActive = useCallback(
      (emoji: string) => {
        const reaction = reactions.find((r) => r.emoji === emoji);
        return !!reaction && reaction.users.includes(userId);
      },
      [reactions],
    );

    const setMessageItemActionElementPortialContext =
      useSetMessageItemActionElementPortialContext();
    const setMessageItemActionTypeContext = useSetMessageItemActionTypeContext();

    const onMouseEnter: MouseEventHandler<HTMLDivElement> = useCallback(
      (e) => {
        if (!isSingleBlockMode && disableEditing) return;
        setMessageItemActionElementPortialContext(e.currentTarget);
        setMessageItemActionTypeContext({ id, index, type: actionType });
      },
      [
        actionType,
        disableEditing,
        id,
        index,
        isSingleBlockMode,
        setMessageItemActionElementPortialContext,
        setMessageItemActionTypeContext,
      ],
    );

    const onAvatarClick = useCallback(() => {
      if (!isInbox) {
        toggleSystemRole(true);
      } else {
        openChatSettings();
      }
    }, [isInbox]);

    return (
      <ChatItem
        showTitle
        aboveMessage={isSingleBlockMode ? null : undefined}
        avatar={avatar}
        customErrorRender={
          isSingleBlockMode ? (error) => <ErrorMessageExtra data={item} error={error} /> : undefined
        }
        editing={isSingleBlockMode ? editing : undefined}
        placement={'left'}
        time={createdAt}
        loading={isSingleBlockMode ? generating || isCreating : undefined}
        message={isSingleBlockMode ? message : undefined}
        actions={
          (isSingleBlockMode || !disableEditing) && (
            <>
              {isDevMode && branch && (
                <MessageBranch
                  activeBranchIndex={branch.activeBranchIndex}
                  count={branch.count}
                  messageId={id}
                />
              )}
              {createActionBarHolder(actionBarPortalAttribute)}
            </>
          )
        }
        error={
          isSingleBlockMode &&
          errorContent &&
          error &&
          (message === LOADING_FLAT || !message || shouldForceShowError)
            ? errorContent
            : undefined
        }
        messageExtra={
          isSingleBlockMode ? (
            <>
              {interrupted && <InterruptedHint />}
              <AssistantMessageExtra
                content={content}
                extra={extra}
                id={id}
                model={model}
                performance={performance || metadata}
                provider={provider}
                tools={tools}
                usage={usage || metadata}
              />
            </>
          ) : undefined
        }
        onAvatarClick={isSingleBlockMode ? undefined : onAvatarClick}
        onDoubleClick={isSingleBlockMode ? onDoubleClick : undefined}
        onMouseEnter={onMouseEnter}
      >
        {blocks.length > 0 && (
          <Group
            blocks={blocks}
            content={isSingleBlockMode ? content : lastAssistantMsg?.content}
            contentId={contentId}
            defaultWorkflowExpanded={defaultWorkflowExpanded}
            disableEditing={disableEditing}
            id={id}
            messageIndex={index}
          />
        )}
        {aggregatedFileList.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <FileListViewer items={aggregatedFileList} />
          </div>
        )}
        {!isSingleBlockMode && interrupted && <InterruptedHint />}
        {!isSingleBlockMode && isDevMode && model && (
          <Usage model={model} performance={performance} provider={provider!} usage={usage} />
        )}
        {reactions.length > 0 && (
          <ReactionDisplay
            isActive={isReactionActive}
            messageId={id}
            reactions={reactions}
            onReactionClick={handleReactionClick}
          />
        )}
        <Suspense fallback={null}>
          {!isSingleBlockMode && editing && contentId && (
            <EditState content={lastAssistantMsg?.content || ''} id={contentId} />
          )}
        </Suspense>
      </ChatItem>
    );
  },
  isEqual,
);

export default GroupMessage;
