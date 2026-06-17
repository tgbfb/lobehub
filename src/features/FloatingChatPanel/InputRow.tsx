'use client';

import { createGlobalStyle, createStaticStyles } from 'antd-style';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { ChatInput } from '@/features/Conversation';

import HoverExpandBar from './HoverExpandBar';

const HOVER_HIDE_DELAY_MS = 200;

const styles = createStaticStyles(({ css }) => ({
  row: css`
    position: relative;
    flex-shrink: 0;
  `,
  surface: css`
    view-transition-name: floating-chat-panel-input;
  `,
}));

const InputRowViewTransitionStyle = createGlobalStyle`
  ::view-transition-old(floating-chat-panel-input),
  ::view-transition-new(floating-chat-panel-input) {
    animation-duration: 240ms;
    animation-timing-function: cubic-bezier(0.32, 0.72, 0, 1);
  }
`;

const supportsViewTransition =
  typeof document !== 'undefined' &&
  typeof (document as Document & { startViewTransition?: unknown }).startViewTransition ===
    'function';

const startViewTransition = (callback: () => void) => {
  (document as Document & { startViewTransition: (cb: () => void) => unknown }).startViewTransition(
    callback,
  );
};

const EMPTY_ACTIONS: never[] = [];
const EXPANDED_LEFT_ACTIONS: ('typo' | 'stt')[] = ['typo', 'stt'];
const EXPANDED_RIGHT_ACTIONS: 'contextWindow'[] = ['contextWindow'];

export interface InputRowProps {
  isCollapsed: boolean;
  onExpand: () => void;
}

const InputRow = memo<InputRowProps>(({ isCollapsed, onExpand }) => {
  const s = styles;
  const [hovered, setHovered] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [renderedCollapsed, setRenderedCollapsed] = useState(isCollapsed);

  // ChatInput's height changes the moment leftActions/rightActions/showControlBar flip.
  // Wrap the React commit in a View Transition so the browser crossfades the snapshot —
  // no fork of ChatInput required. Falls back to an instant flip where unsupported.
  useEffect(() => {
    if (renderedCollapsed === isCollapsed) return;
    if (!supportsViewTransition) {
      setRenderedCollapsed(isCollapsed);
      return;
    }
    startViewTransition(() => {
      // View Transition snapshots the DOM before and after this callback. The DOM mutation
      // must commit synchronously inside it, otherwise the "after" snapshot is identical
      // to the "before" one and nothing animates.
      // eslint-disable-next-line @eslint-react/dom/no-flush-sync
      flushSync(() => setRenderedCollapsed(isCollapsed));
    });
  }, [isCollapsed, renderedCollapsed]);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const handleEnter = useCallback(() => {
    clearHideTimer();
    setHovered(true);
  }, [clearHideTimer]);

  const handleLeave = useCallback(() => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => setHovered(false), HOVER_HIDE_DELAY_MS);
  }, [clearHideTimer]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  useEffect(() => {
    if (!isCollapsed && hovered) setHovered(false);
  }, [isCollapsed, hovered]);

  return (
    <>
      <InputRowViewTransitionStyle />
      <div
        className={s.row}
        data-collapsed={isCollapsed}
        data-testid="floating-chat-panel-input-row"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <HoverExpandBar visible={isCollapsed && hovered} onExpand={onExpand} />
        <div className={s.surface}>
          <ChatInput
            compact={renderedCollapsed}
            leftActions={renderedCollapsed ? EMPTY_ACTIONS : EXPANDED_LEFT_ACTIONS}
            rightActions={renderedCollapsed ? EMPTY_ACTIONS : EXPANDED_RIGHT_ACTIONS}
            showControlBar={!renderedCollapsed}
          />
        </div>
      </div>
    </>
  );
});

InputRow.displayName = 'FloatingChatPanelInputRow';

export default InputRow;
