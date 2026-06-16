import {
  GROUP_CHAT_URL,
  isDesktop,
  SESSION_CHAT_TOPIC_URL,
  SESSION_CHAT_URL,
} from '@lobechat/const';
import type { ConversationContext } from '@lobechat/types';
import { t } from 'i18next';

import { getAgentStoreState } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import type { ChatStore } from '@/store/chat/store';
import { markdownToTxt } from '@/utils/markdownToTxt';

import { topicMapKey } from './topicMapKey';

export interface DesktopNotificationContext {
  agentId?: ConversationContext['agentId'];
  groupId?: ConversationContext['groupId'];
  topicId?: ConversationContext['topicId'];
}

/** Cap the notification body so a long reply doesn't overflow the OS banner. */
const NOTIFICATION_BODY_MAX_LENGTH = 256;

/**
 * Resolve the SPA path that should be opened when the user clicks a desktop
 * notification, based on the conversation context. Group chats land on the
 * group root (topic is selected from store), 1:1 chats deep-link to the
 * specific topic.
 */
export const resolveNotificationNavigatePath = (
  context: DesktopNotificationContext,
): string | undefined => {
  if (context.groupId) return GROUP_CHAT_URL(context.groupId);
  if (context.agentId && context.topicId) {
    return SESSION_CHAT_TOPIC_URL(context.agentId, context.topicId);
  }
  if (context.agentId) return SESSION_CHAT_URL(context.agentId);
  return undefined;
};

/**
 * Resolve the notification title from the conversation context. Prefers the
 * topic title, then the agent name, and finally the caller-provided fallback.
 */
export const resolveNotificationTitle = (
  get: () => ChatStore,
  context: DesktopNotificationContext,
  fallbackTitle: string,
): string => {
  if (context.topicId && context.agentId) {
    const key = topicMapKey({ agentId: context.agentId, groupId: context.groupId });
    const topicData = get().topicDataMap?.[key];
    const topic = topicData?.items?.find((item) => item.id === context.topicId);

    if (topic?.title) return topic.title;
  }

  if (context.agentId) {
    const agentMeta = agentSelectors.getAgentMetaById(context.agentId)(getAgentStoreState());

    if (agentMeta?.title) return agentMeta.title;
  }

  return fallbackTitle;
};

/** Convert the assistant's markdown reply to a length-capped plain-text body. */
export const buildNotificationBody = (
  content: string | undefined,
  fallbackBody: string,
): string => {
  const text = content ? markdownToTxt(content).trim() : '';
  if (!text) return fallbackBody;
  return text.length > NOTIFICATION_BODY_MAX_LENGTH
    ? `${text.slice(0, NOTIFICATION_BODY_MAX_LENGTH)}…`
    : text;
};

export const notifyDesktopHumanApprovalRequired = async (
  get: () => ChatStore,
  context: DesktopNotificationContext,
): Promise<void> => {
  if (!isDesktop) return;

  try {
    const { desktopNotificationService } = await import('@/services/electron/desktopNotification');
    const title = resolveNotificationTitle(
      get,
      context,
      t('desktopNotification.humanApprovalRequired.title', { ns: 'chat' }),
    );

    const navigatePath = resolveNotificationNavigatePath(context);

    await Promise.allSettled([
      desktopNotificationService.setBadgeCount(1),
      desktopNotificationService.showNotification({
        body: t('desktopNotification.humanApprovalRequired.body', { ns: 'chat' }),
        force: true,
        navigate: navigatePath ? { path: navigatePath } : undefined,
        requestAttention: true,
        title,
      }),
    ]);
  } catch (error) {
    console.error('Human approval desktop notification failed:', error);
  }
};

export interface AgentCompletedNotificationOptions {
  /** Whether to also bump the dock/taskbar badge to 1. */
  badge?: boolean;
  /** The assistant's final reply (markdown); rendered as the notification body. */
  content?: string;
  context: DesktopNotificationContext;
}

/**
 * Unified "agent run finished" desktop notification. Title is the topic/agent
 * name, body is the actual reply (length-capped), and clicking deep-links to
 * the conversation. This is the single injection point the run paths should
 * call so every completion notification stays consistent — callers only pass
 * their context + content, never assemble title/body/navigate themselves.
 */
export const notifyDesktopAgentCompleted = async (
  get: () => ChatStore,
  { context, content, badge }: AgentCompletedNotificationOptions,
): Promise<void> => {
  if (!isDesktop) return;

  try {
    const { desktopNotificationService } = await import('@/services/electron/desktopNotification');
    const fallback = t('notification.finishChatGeneration', { ns: 'electron' });
    const navigatePath = resolveNotificationNavigatePath(context);

    const tasks: Promise<unknown>[] = [
      desktopNotificationService.showNotification({
        body: buildNotificationBody(content, fallback),
        navigate: navigatePath ? { path: navigatePath } : undefined,
        title: resolveNotificationTitle(get, context, fallback),
      }),
    ];
    if (badge) tasks.push(desktopNotificationService.setBadgeCount(1));

    await Promise.allSettled(tasks);
  } catch (error) {
    console.error('Agent completion desktop notification failed:', error);
  }
};
