'use client';

import { EditorProvider, useEditor } from '@lobehub/editor/react';
import { Flexbox } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import type { CSSProperties } from 'react';
import { memo } from 'react';

import { EditorCanvas as SharedEditorCanvas } from '@/features/EditorCanvas';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useRegisterFilesHotkeys } from '@/hooks/useHotkeys';
import { StyleSheet } from '@/utils/styles';

import TitleSection, { type TitleSectionProps } from './TitleSection';

const styles = StyleSheet.create({
  contentWrapper: {
    display: 'flex',
    overflowY: 'auto',
    position: 'relative',
  },
  editorContent: {
    overflowY: 'auto',
    paddingBlock: 16,
    position: 'relative',
  },
  root: {
    background: cssVar.colorBgContainer,
    borderRadius: 12,
    overflow: 'hidden',
  },
});

export interface TopicCanvasProps extends TitleSectionProps {
  agentId?: string;
  documentId?: string;
  placeholder?: string;
  style?: CSSProperties;
  topicId?: string | null;
}

const TopicCanvasBody = memo<TopicCanvasProps>(
  ({ placeholder, style, emoji, title, documentId, onEmojiChange, onTitleChange }) => {
    const editor = useEditor();

    useRegisterFilesHotkeys();

    return (
      <Flexbox
        horizontal
        height={'100%'}
        style={styles.contentWrapper}
        width={'100%'}
        onClick={() => editor?.focus()}
      >
        <WideScreenContainer wrapperStyle={{ cursor: 'text' }}>
          <Flexbox flex={1} style={styles.editorContent}>
            <TitleSection
              emoji={emoji}
              title={title}
              onEmojiChange={onEmojiChange}
              onTitleChange={onTitleChange}
            />
            <SharedEditorCanvas
              documentId={documentId}
              editor={editor}
              placeholder={placeholder}
              sourceType={'notebook'}
              style={style}
            />
          </Flexbox>
        </WideScreenContainer>
      </Flexbox>
    );
  },
);

TopicCanvasBody.displayName = 'TopicCanvasBody';

/**
 * TopicCanvas
 *
 * Document canvas for a Topic. Mirrors PageEditor's editor-region layout but
 * without the page chrome (header, title, right panel). Renders an empty
 * editor; topic-document data wiring (fetch/auto-save) is intentionally
 * deferred.
 */
const TopicCanvas = memo<TopicCanvasProps>((props) => {
  return (
    <Flexbox flex={1} height={'100%'} style={styles.root} width={'100%'}>
      <EditorProvider>
        <TopicCanvasBody {...props} />
      </EditorProvider>
    </Flexbox>
  );
});

TopicCanvas.displayName = 'TopicCanvas';

export default TopicCanvas;
