import { describe, expect, it } from 'vitest';

import {
  getKeepMountedIndices,
  getVisibleStreamingMessageIds,
  prunePinnedStreamingMessageIds,
} from './useKeepMountedIndices';

describe('useKeepMountedIndices helpers', () => {
  it('should not pass keepMounted when no message needs pinning', () => {
    expect(
      getKeepMountedIndices({
        dataSource: ['user-1', 'assistant-1'],
        pinnedStreamingMessageIds: new Set(),
        selectionMessageIds: new Set(),
      }),
    ).toBeUndefined();
  });

  it('should keep only streaming messages that have already been pinned', () => {
    expect(
      getKeepMountedIndices({
        dataSource: ['user-1', 'assistant-1', 'user-2', 'assistant-2'],
        pinnedStreamingMessageIds: new Set(['assistant-1']),
        selectionMessageIds: new Set(),
      }),
    ).toEqual([1]);
  });

  it('should keep selected messages independently from streaming pins', () => {
    expect(
      getKeepMountedIndices({
        dataSource: ['user-1', 'assistant-1', 'user-2'],
        pinnedStreamingMessageIds: new Set(['assistant-1']),
        selectionMessageIds: new Set(['user-2']),
      }),
    ).toEqual([1, 2]);
  });

  it('should only mark streaming messages inside the current viewport range as visible', () => {
    expect(
      getVisibleStreamingMessageIds({
        dataSource: ['user-1', 'assistant-1', 'user-2', 'assistant-2'],
        endIndex: 1,
        startIndex: 0,
        streamingMessageIds: new Set(['assistant-1', 'assistant-2']),
      }),
    ).toEqual(new Set(['assistant-1']));
  });

  it('should prune pins once messages stop streaming or leave the data source', () => {
    expect(
      prunePinnedStreamingMessageIds({
        dataSource: ['user-1', 'assistant-1', 'user-2'],
        pinnedStreamingMessageIds: new Set(['assistant-1', 'assistant-2']),
        streamingMessageIds: new Set(['assistant-2']),
      }),
    ).toEqual(new Set());
  });
});
