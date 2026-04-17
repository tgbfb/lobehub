import { LOADING_FLAT } from '@lobechat/const';
import { type UIChatMessage } from '@lobechat/types';
import { Flexbox } from '@lobehub/ui';
import { memo, useCallback } from 'react';

import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { ReactionDisplay } from '../../components/Reaction';
import { messageStateSelectors, useConversationStore } from '../../store';
import { CollapsedMessage } from '../AssistantGroup/components/CollapsedMessage';
import DisplayContent from './DisplayContent';
import FileChunks from './FileChunks';
import ImageFileListViewer from './ImageFileListViewer';
import Reasoning from './Reasoning';
import SearchGrounding from './SearchGrounding';
import { useMarkdown } from '../useMarkdown';

const AssistantMessageContent = memo<UIChatMessage>(
  ({ id, tools, content, chunksList, search, imageList, metadata, ...props }) => {
    const markdownProps = useMarkdown(id);
    const generating = useConversationStore(messageStateSelectors.isMessageGenerating(id));
    const isCreating = useConversationStore(messageStateSelectors.isMessageCreating(id));
    const isCollapsed = useConversationStore(messageStateSelectors.isMessageCollapsed(id));
    const isReasoning = useConversationStore(messageStateSelectors.isMessageInReasoning(id));
    const addReaction = useConversationStore((s) => s.addReaction);
    const removeReaction = useConversationStore((s) => s.removeReaction);
    const userId = useUserStore(userProfileSelectors.userId)!;

    const isLoading = generating || isCreating;
    const isToolCallGenerating = isLoading && (content === LOADING_FLAT || !content) && !!tools;

    const showSearch = !!search && (!!search.citations?.length || !!search.imageResults?.length);
    const showImageItems = !!imageList && imageList.length > 0;
    const showReasoning =
      (!!props.reasoning && props.reasoning.content?.trim() !== '') ||
      (!props.reasoning && isReasoning);
    const showFileChunks = !!chunksList && chunksList.length > 0;

    const reactions = metadata?.reactions || [];

    const handleReactionClick = useCallback(
      (emoji: string) => {
        const existing = reactions.find((r) => r.emoji === emoji);
        if (existing && existing.users.includes(userId)) {
          removeReaction(id, emoji);
        } else {
          addReaction(id, emoji);
        }
      },
      [id, reactions, addReaction, removeReaction, userId],
    );

    const isActive = useCallback(
      (emoji: string) => {
        const reaction = reactions.find((r) => r.emoji === emoji);
        return !!reaction && reaction.users.includes(userId);
      },
      [reactions, userId],
    );

    if (isCollapsed) return <CollapsedMessage content={content} id={id} />;

    return (
      <Flexbox gap={8} id={id}>
        {showSearch && (
          <SearchGrounding
            citations={search?.citations}
            imageResults={search?.imageResults}
            imageSearchQueries={search?.imageSearchQueries}
            searchQueries={search?.searchQueries}
          />
        )}
        {showFileChunks && <FileChunks data={chunksList} />}
        {showReasoning && <Reasoning {...props.reasoning} id={id} />}
        <DisplayContent
          content={content}
          generating={isLoading}
          hasImages={showImageItems}
          id={id}
          isMultimodal={metadata?.isMultimodal}
          isToolCallGenerating={isToolCallGenerating}
          markdownProps={markdownProps}
          tempDisplayContent={metadata?.tempDisplayContent}
        />
        {showImageItems && <ImageFileListViewer items={imageList} />}
        {reactions.length > 0 && (
          <ReactionDisplay
            isActive={isActive}
            messageId={id}
            reactions={reactions}
            onReactionClick={handleReactionClick}
          />
        )}
      </Flexbox>
    );
  },
);

export default AssistantMessageContent;
