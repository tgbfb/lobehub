import { describe, expect, it } from 'vitest';

import type { ChatStore } from '@/store/chat/store';

import {
  buildNotificationBody,
  resolveNotificationNavigatePath,
  resolveNotificationTitle,
} from './desktopNotification';
import { topicMapKey } from './topicMapKey';

const mockGet = (topicDataMap?: Record<string, any>) =>
  (() => ({ topicDataMap })) as unknown as () => ChatStore;

describe('resolveNotificationNavigatePath', () => {
  it('deep-links a 1:1 chat to its topic', () => {
    expect(resolveNotificationNavigatePath({ agentId: 'a1', topicId: 't1' })).toContain('a1');
  });

  it('returns undefined without an agent/group', () => {
    expect(resolveNotificationNavigatePath({})).toBeUndefined();
  });
});

describe('resolveNotificationTitle', () => {
  it('prefers the topic title', () => {
    const get = mockGet({
      [topicMapKey({ agentId: 'a1' })]: { items: [{ id: 't1', title: 'My Topic' }] },
    });
    expect(resolveNotificationTitle(get, { agentId: 'a1', topicId: 't1' }, 'fallback')).toBe(
      'My Topic',
    );
  });

  it('uses the provided fallback when nothing resolves', () => {
    const get = mockGet();
    expect(resolveNotificationTitle(get, { agentId: 'a1' }, 'fallback')).toBe('fallback');
  });

  it('does not throw when the topic data slice is missing', () => {
    const get = mockGet();
    expect(() =>
      resolveNotificationTitle(get, { agentId: 'a1', topicId: 't1' }, 'fallback'),
    ).not.toThrow();
  });
});

describe('buildNotificationBody', () => {
  it('strips markdown to plain text', () => {
    expect(buildNotificationBody('**bold** reply', 'fallback')).toBe('bold reply');
  });

  it('falls back when there is no content', () => {
    expect(buildNotificationBody(undefined, 'fallback')).toBe('fallback');
    expect(buildNotificationBody('   ', 'fallback')).toBe('fallback');
  });

  it('truncates an overlong body with an ellipsis', () => {
    const long = 'a'.repeat(400);
    const result = buildNotificationBody(long, 'fallback');
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBe(257); // 256 chars + ellipsis
  });
});
