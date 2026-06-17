'use client';

import { createGlobalStyle, createStaticStyles } from 'antd-style';
import { type FocusEvent, memo, useCallback, useEffect, useRef, useState } from 'react';
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

// View Transition snapshots the DOM before and after this callback. The DOM mutation
// must commit synchronously inside it, otherwise the "after" snapshot is identical
// to the "before" one and nothing animates.
const commitWithViewTransition = (commit: () => void) => {
  if (!supportsViewTransition) {
    commit();
    return;
  }
  startViewTransition(() => {
    // eslint-disable-next-line @eslint-react/dom/no-flush-sync
    flushSync(commit);
  });
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
  const [focused, setFocused] = useState(false);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (renderedCollapsed === isCollapsed) return;
    commitWithViewTransition(() => setRenderedCollapsed(isCollapsed));
  }, [isCollapsed, renderedCollapsed]);

  // Focus inside the collapsed strip releases the compact rendering so the action bar
  // (Send + actions) shows while the panel itself stays collapsed. Blurring back outside
  // the row returns to compact. View Transition makes the footer enter / leave smoothly.
  const handleFocus = useCallback(() => {
    if (focusedRef.current) return;
    focusedRef.current = true;
    commitWithViewTransition(() => setFocused(true));
  }, []);

  const handleBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    if (!focusedRef.current) return;
    focusedRef.current = false;
    commitWithViewTransition(() => setFocused(false));
  }, []);

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

  const effectiveCompact = renderedCollapsed && !focused;

  return (
    <>
      <InputRowViewTransitionStyle />
      <div
        className={s.row}
        data-collapsed={isCollapsed}
        data-testid="floating-chat-panel-input-row"
        onBlur={handleBlur}
        onFocus={handleFocus}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <HoverExpandBar visible={isCollapsed && hovered} onExpand={onExpand} />
        <div className={s.surface}>
          <ChatInput
            compact={effectiveCompact}
            leftActions={effectiveCompact ? EMPTY_ACTIONS : EXPANDED_LEFT_ACTIONS}
            rightActions={effectiveCompact ? EMPTY_ACTIONS : EXPANDED_RIGHT_ACTIONS}
            showControlBar={!effectiveCompact}
          />
        </div>
      </div>
    </>
  );
});

InputRow.displayName = 'FloatingChatPanelInputRow';

export default InputRow;
