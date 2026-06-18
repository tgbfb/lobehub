'use client';

import { ThreadType, type UIChatMessage } from '@lobechat/types';
import { ActionIcon } from '@lobehub/ui';
import { FloatingSheet, type FloatingSheetProps } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  type ActionsBarConfig,
  type ConversationHooks,
  ConversationProvider,
} from '@/features/Conversation';
import { useChatFollowUp } from '@/features/Conversation/hooks/useChatFollowUp';
import { type ConversationContext } from '@/features/Conversation/types';
import { mergeConversationHooks } from '@/features/Conversation/utils/mergeConversationHooks';
import { useOperationState } from '@/hooks/useOperationState';
import { useActionsBarConfig } from '@/routes/(main)/agent/features/Conversation/useActionsBarConfig';
import { useAgentStore } from '@/store/agent';
import { chatConfigByIdSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';

import ChatBody from './ChatBody';
import { useSingleInstanceGuard } from './guard';
import InputRow from './InputRow';

const SNAP_POINTS = [420, 800] as const;
const MID_SNAP_POINT = SNAP_POINTS[0];
const MAX_SNAP_POINT = SNAP_POINTS.at(-1)!;

const styles = createStaticStyles(({ css, cssVar }) => ({
  panel: css`
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    align-self: stretch;

    width: 100%;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};

    transition:
      border-color 240ms cubic-bezier(0.32, 0.72, 0, 1),
      background 240ms cubic-bezier(0.32, 0.72, 0, 1);

    /* Collapsed strip should sit flush against the page — only the expanded sheet earns the card surface. */
    &[data-collapsed='true'] {
      border-color: transparent;
      background: transparent;
    }
  `,
  sheetSeamless: css`
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  `,
  titleSpacer: css`
    flex: 1;
  `,
}));

export interface FloatingChatPanelProps {
  /**
   * Override the actions bar config. When omitted, defaults to the shared
   * `useActionsBarConfig()` hook for parity with the main agent page.
   */
  actionsBar?: ActionsBarConfig;
  activeSnapPoint?: number;
  /**
   * Agent document row id (`agent_documents.id`) for the document the user is
   * viewing. When supplied, the active document is injected with
   * `agent_document_id` so LLM tool calls (`readDocument` / `modifyNodes`) can
   * use it directly without a `listDocuments` reverse lookup.
   */
  agentDocumentId?: string;
  agentId: string;
  className?: string;
  dismissible?: boolean;
  /**
   * Active document id for the conversation context. Passed through so the
   * `ActiveTopicDocumentContextInjector` can tell the LLM which agent document
   * the user is currently viewing (e.g. when opened from a document preview
   * portal). Omit when no document is in focus.
   */
  documentId?: string;
  headerActions?: ReactNode;
  /**
   * Conversation lifecycle hooks. Forwarded into the internal
   * `ConversationProvider`. The panel wraps `onAfterSendMessage` to auto-expand
   * the sheet to its tallest snap point on send.
   */
  hooks?: ConversationHooks;
  maxHeight?: number;
  minHeight?: number;
  mode?: 'embedded' | 'overlay';
  onOpenChange?: (open: boolean) => void;
  onSnapPointChange?: (point: number) => void;
  open?: boolean;
  /**
   * Conversation scope.
   *
   * - `'main'` (recommended for doc-anchored chat): the panel is the canonical
   *   surface for the supplied `topicId`. Messages are loaded by
   *   `ConversationProvider`'s own fetch and persist through the standard
   *   main-scope pipeline. The caller must guarantee `topicId` is defined.
   * - `'thread'` (legacy in-chat portal): the panel owns an isolated thread
   *   under the supplied `topicId`. When `threadId` is absent, the context is
   *   marked `isNew` and a fresh thread is created on first send, anchored on
   *   the topic's latest main message. The panel manages its own message slice
   *   to avoid dumping the parent topic history into the side panel.
   */
  scope?: 'main' | 'thread';
  snapPoints?: number[];
  /** Opens an existing thread when set; otherwise the panel starts ephemeral. */
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
 * Reusable floating conversation panel — composes `ChatList` + `ChatInput`
 * inside a `FloatingSheet`. Consumers provide conversation coordinates via
 * flat `agentId` / `topicId` / `threadId` props; the panel builds its own
 * `ConversationContext` internally.
 *
 * Single instance per page (see `./guard.ts`).
 */
const FloatingChatPanel = memo<FloatingChatPanelProps>(
  ({
    agentId,
    topicId,
    threadId = null,
    documentId,
    agentDocumentId,
    scope = 'thread',
    actionsBar,
    hooks,

    width = '100%',

    title,
    headerActions,
  }) => {
    useSingleInstanceGuard();
    const { t } = useTranslation('chat');

    const isMainScope = scope === 'main';

    const storePortalThreadId = useChatStore((s) => s.portalThreadId);
    const effectiveThreadId = threadId ?? storePortalThreadId ?? null;

    useEffect(() => {
      if (isMainScope) return;
      if (threadId) return;
      if (useChatStore.getState().portalThreadId) {
        useChatStore.setState({ portalThreadId: undefined });
      }
    }, [isMainScope, threadId]);

    const isCreatingNewThread = !isMainScope && !effectiveThreadId;
    const sourceMessageId = useChatStore((s) => {
      if (isMainScope || !isCreatingNewThread || !topicId) return undefined;
      const mainKey = messageMapKey({ agentId, topicId });
      const mainMessages = s.dbMessagesMap[mainKey];
      if (!mainMessages?.length) return undefined;
      for (let i = mainMessages.length - 1; i >= 0; i -= 1) {
        const msg = mainMessages[i]!;
        if (!msg.threadId) return msg.id;
      }
      return undefined;
    });

    const context = useMemo<ConversationContext>(
      () => ({
        agentId,
        ...(agentDocumentId ? { agentDocumentId } : {}),
        ...(documentId ? { documentId } : {}),
        ...(!isMainScope && isCreatingNewThread && sourceMessageId
          ? { isNew: true, sourceMessageId, threadType: ThreadType.Standalone }
          : !isMainScope && isCreatingNewThread
            ? { isNew: true }
            : {}),
        scope,
        threadId: isMainScope ? null : effectiveThreadId,
        topicId,
      }),
      [
        agentId,
        agentDocumentId,
        documentId,
        effectiveThreadId,
        isCreatingNewThread,
        isMainScope,
        scope,
        sourceMessageId,
        topicId,
      ],
    );

    const chatKey = useMemo(() => messageMapKey(context), [context]);
    const rawMessages = useChatStore((s) => s.dbMessagesMap[chatKey]);
    const replaceMessages = useChatStore((s) => s.replaceMessages);

    // `'thread'` scope owns its message slice externally — see the inline note
    // on the ConversationProvider below. `'main'` scope hands message loading
    // off to the provider entirely and is uninterested in this derivation.
    const threadMessages = useMemo(() => {
      if (isMainScope) return undefined;
      if (!effectiveThreadId) return [];
      if (!rawMessages) return rawMessages;
      return rawMessages.filter((m) => m.threadId === effectiveThreadId);
    }, [isMainScope, rawMessages, effectiveThreadId]);

    const operationState = useOperationState(context);
    const defaultActionsBar = useActionsBarConfig();
    const resolvedActionsBar = actionsBar ?? defaultActionsBar;

    const handleMessagesChange = useMemo(
      () => (next: UIChatMessage[], ctx: ConversationContext) => {
        replaceMessages(next, { context: ctx });
      },
      [replaceMessages],
    );

    const [isCollapsed, setIsCollapsed] = useState(true);
    const [activeSnapPoint, setActiveSnapPoint] = useState<number>(MID_SNAP_POINT);

    const expand = useCallback(() => {
      setActiveSnapPoint(MID_SNAP_POINT);
      setIsCollapsed(false);
    }, []);

    const collapse = useCallback(() => {
      setIsCollapsed(true);
      setActiveSnapPoint(MID_SNAP_POINT);
    }, []);

    const handleOpenChange = useCallback(
      (open: boolean) => {
        if (!open) collapse();
      },
      [collapse],
    );

    const agentChatConfig = useAgentStore(chatConfigByIdSelectors.getChatConfigById(agentId));
    const chatFollowUpHooks = useChatFollowUp({
      agentChatConfig,
      conversationKey: chatKey,
      threadId: effectiveThreadId ?? undefined,
      topicId: topicId ?? undefined,
    });

    const mergedHooks = useMemo<ConversationHooks>(
      () =>
        mergeConversationHooks(
          hooks,
          {
            onBeforeSendMessage: async () => {
              expand();
            },
          },
          chatFollowUpHooks,
        ),
      [hooks, chatFollowUpHooks, expand],
    );

    const collapseAction = (
      <ActionIcon
        data-testid="floating-chat-panel-collapse-button"
        icon={ChevronDown}
        size="small"
        title={t('floatingChatPanel.collapse', { defaultValue: 'Collapse' })}
        onClick={collapse}
      />
    );

    const sheetProps: FloatingSheetProps = {
      activeSnapPoint,
      className: styles.sheetSeamless,
      closeThreshold: 0.5,
      defaultOpen: false,
      dismissible: true,
      headerActions: (
        <>
          {headerActions}
          {collapseAction}
        </>
      ),
      maxHeight: MAX_SNAP_POINT,
      minHeight: MID_SNAP_POINT,
      mode: 'inline',
      onOpenChange: handleOpenChange,
      onSnapPointChange: setActiveSnapPoint,
      open: !isCollapsed,
      restingHeight: MID_SNAP_POINT,
      snapPoints: [...SNAP_POINTS],
      // Always render a title slot — `space-between` on the header pulls the
      // single child (headerActions) to the start otherwise, putting the
      // collapse button on the left.
      title: title ?? <span className={styles.titleSpacer} />,
      variant: 'elevated',
      width,
    };

    // Doc-anchored side chat (`'thread'`) owns its messages via the external
    // `messages` prop (filtered from `dbMessagesMap` above). Letting
    // ConversationProvider fire its own `useFetchMessages` here would pull the
    // main-topic history from the server and drop it into this panel —
    // exactly the parent dump A-mode is meant to avoid.
    //
    // `'main'` scope is the inverse: the panel IS the canonical surface for
    // the topic. Let ConversationProvider fetch + manage messages normally.
    const providerProps = isMainScope
      ? {}
      : {
          hasInitMessages: true as const,
          messages: threadMessages ?? [],
          onMessagesChange: handleMessagesChange,
          skipFetch: true as const,
        };

    return (
      <ConversationProvider
        actionsBar={resolvedActionsBar}
        context={context}
        hooks={mergedHooks}
        operationState={operationState}
        {...providerProps}
      >
        <div
          className={styles.panel}
          data-collapsed={isCollapsed}
          data-testid="floating-chat-panel"
        >
          <FloatingSheet {...sheetProps}>
            <ChatBody />
          </FloatingSheet>
          <InputRow isCollapsed={isCollapsed} onExpand={expand} />
        </div>
      </ConversationProvider>
    );
  },
);

FloatingChatPanel.displayName = 'FloatingChatPanel';

export default FloatingChatPanel;
