'use client';

import { type UIChatMessage } from '@lobechat/types';
import { createStaticStyles, cx } from 'antd-style';
import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';

import { type ActionsBarConfig, ConversationProvider } from '@/features/Conversation';
import { type ConversationContext } from '@/features/Conversation/types';
import { useOperationState } from '@/hooks/useOperationState';
import { useActionsBarConfig } from '@/routes/(main)/agent/features/Conversation/useActionsBarConfig';
import { useChatStore } from '@/store/chat';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';

import ChatBody from './ChatBody';
import { useSingleInstanceGuard } from './guard';

const styles = createStaticStyles(({ css }) => ({
  sheet: css`
    overflow: hidden;
    display: flex;
    flex: 1;
    flex-direction: column;

    min-height: 0;
  `,
  header: css`
    display: flex;
    flex-shrink: 0;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  `,
  title: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  body: css`
    overflow: hidden;
    display: flex;
    flex: 1;
    flex-direction: column;

    min-height: 0;
  `,
}));

export interface FloatingChatPanelProps {
  /**
   * Override the actions bar config. When omitted, defaults to the shared
   * `useActionsBarConfig()` hook for parity with the main agent page.
   */
  actionsBar?: ActionsBarConfig;
  activeSnapPoint?: number;
  /** Agent identifier. */
  agentId: string;
  className?: string;
  dismissible?: boolean;
  headerActions?: ReactNode;
  maxHeight?: number;
  minHeight?: number;
  mode?: 'embedded' | 'overlay';
  onOpenChange?: (open: boolean) => void;
  onSnapPointChange?: (point: number) => void;
  open?: boolean;
  snapPoints?: number[];
  /** Optional thread identifier. When provided, scope becomes `'thread'`. */
  threadId?: string | null;
  title?: ReactNode;
  /** Topic identifier. `null` means a new / unpersisted conversation. */
  topicId: string | null;
  variant?: 'elevated' | 'embedded';
  width?: number | string;
}

/**
 * FloatingChatPanel
 *
 * A reusable floating conversation panel. Composes ChatList + MainChatInput inside
 * a container shell. Consumers provide conversation coordinates via flat
 * `agentId`/`topicId` props; the component builds its own `ConversationContext`
 * internally.
 *
 * @FIXME ⚠️ Single instance per page. Mounting a second FloatingChatPanel while one is
 * already mounted will throw. See `./guard.ts` for the rationale.
 *
 * @FIXME ⚠️ Must not coexist with the main-page ConversationArea (both use MainChatInput,
 * which writes to the global `useChatStore.mainInputEditor` slot). This is NOT
 * enforced at runtime — consumer responsibility.
 */
const FloatingChatPanel = memo<FloatingChatPanelProps>(
  ({
    agentId,
    topicId,
    threadId = null,
    actionsBar,
    snapPoints = [0.5, 0.9],
    minHeight = 240,
    maxHeight = 0.9,
    mode = 'overlay',
    variant = 'elevated',
    width = '100%',
    dismissible = false,
    open,
    activeSnapPoint,
    title,
    headerActions,
    className,
  }) => {
    useSingleInstanceGuard();

    const context = useMemo<ConversationContext>(
      () => ({
        agentId,
        scope: threadId ? 'thread' : 'main',
        threadId,
        topicId,
      }),
      [agentId, topicId, threadId],
    );

    const chatKey = useMemo(() => messageMapKey(context), [context]);
    const messages = useChatStore((s) => s.dbMessagesMap[chatKey]);
    const replaceMessages = useChatStore((s) => s.replaceMessages);

    const operationState = useOperationState(context);
    const defaultActionsBar = useActionsBarConfig();
    const resolvedActionsBar = actionsBar ?? defaultActionsBar;

    const handleMessagesChange = useMemo(
      () => (next: UIChatMessage[], ctx: ConversationContext) => {
        replaceMessages(next, { context: ctx });
      },
      [replaceMessages],
    );

    if (open === false) return null;

    const bodyStyle = {
      maxHeight: maxHeight ? `${Math.round(maxHeight * 100)}%` : undefined,
      minHeight,
      width,
    };

    return (
      <div
        className={cx(styles.sheet, className)}
        data-active-snap-point={activeSnapPoint}
        data-dismissible={String(dismissible)}
        data-mode={mode}
        data-snap-points={JSON.stringify(snapPoints)}
        data-testid={'floating-panel-shell'}
        data-variant={variant}
        style={bodyStyle}
      >
        {(title || headerActions) && (
          <div className={styles.header}>
            <div className={styles.title} data-testid={'sheet-title'}>
              {title}
            </div>
            <div data-testid={'sheet-actions'}>{headerActions}</div>
          </div>
        )}
        <div className={styles.body}>
          <ConversationProvider
            actionsBar={resolvedActionsBar}
            context={context}
            hasInitMessages={!!messages}
            messages={messages}
            operationState={operationState}
            onMessagesChange={handleMessagesChange}
          >
            <ChatBody />
          </ConversationProvider>
        </div>
      </div>
    );
  },
);

FloatingChatPanel.displayName = 'FloatingChatPanel';

export default FloatingChatPanel;
