import { useCallback, useEffect, useMemo, useState } from 'react';

interface VirtuaViewport {
  findItemIndex: (offset: number) => number;
  scrollOffset: number;
  viewportSize: number;
}

interface GetKeepMountedIndicesOptions {
  dataSource: readonly string[];
  pinnedStreamingMessageIds: ReadonlySet<string>;
  selectionMessageIds: ReadonlySet<string>;
}

interface GetVisibleStreamingMessageIdsOptions {
  dataSource: readonly string[];
  endIndex: number | null;
  startIndex: number | null;
  streamingMessageIds: ReadonlySet<string>;
}

interface PrunePinnedStreamingMessageIdsOptions {
  dataSource: readonly string[];
  pinnedStreamingMessageIds: ReadonlySet<string>;
  streamingMessageIds: ReadonlySet<string>;
}

interface UseKeepMountedIndicesOptions {
  dataSource: readonly string[];
  getVirtua: () => VirtuaViewport | null;
  selectionMessageIds: ReadonlySet<string>;
  streamingMessageIds: readonly string[];
}

const setsEqual = (a: ReadonlySet<string>, b: ReadonlySet<string>) => {
  if (a.size !== b.size) return false;

  for (const value of a) {
    if (!b.has(value)) return false;
  }

  return true;
};

export const getKeepMountedIndices = ({
  dataSource,
  pinnedStreamingMessageIds,
  selectionMessageIds,
}: GetKeepMountedIndicesOptions) => {
  const keepMountedIndices: number[] = [];

  for (const [index, id] of dataSource.entries()) {
    if (pinnedStreamingMessageIds.has(id) || selectionMessageIds.has(id)) {
      keepMountedIndices.push(index);
    }
  }

  return keepMountedIndices.length === 0 ? undefined : keepMountedIndices;
};

export const getVisibleStreamingMessageIds = ({
  dataSource,
  endIndex,
  startIndex,
  streamingMessageIds,
}: GetVisibleStreamingMessageIdsOptions) => {
  const visibleStreamingMessageIds = new Set<string>();

  if (streamingMessageIds.size === 0 || startIndex === null || endIndex === null) {
    return visibleStreamingMessageIds;
  }

  const start = Math.max(0, Math.min(startIndex, endIndex));
  const end = Math.min(dataSource.length - 1, Math.max(startIndex, endIndex));
  if (end < start) return visibleStreamingMessageIds;

  for (const [index, id] of dataSource.entries()) {
    if (index < start) continue;
    if (index > end) break;
    if (streamingMessageIds.has(id)) visibleStreamingMessageIds.add(id);
  }

  return visibleStreamingMessageIds;
};

export const prunePinnedStreamingMessageIds = ({
  dataSource,
  pinnedStreamingMessageIds,
  streamingMessageIds,
}: PrunePinnedStreamingMessageIdsOptions) => {
  if (pinnedStreamingMessageIds.size === 0) return pinnedStreamingMessageIds;

  const dataSourceIds = new Set(dataSource);
  const nextPinnedIds = new Set<string>();

  for (const id of pinnedStreamingMessageIds) {
    if (dataSourceIds.has(id) && streamingMessageIds.has(id)) nextPinnedIds.add(id);
  }

  return setsEqual(pinnedStreamingMessageIds, nextPinnedIds)
    ? pinnedStreamingMessageIds
    : nextPinnedIds;
};

export const useKeepMountedIndices = ({
  dataSource,
  getVirtua,
  selectionMessageIds,
  streamingMessageIds,
}: UseKeepMountedIndicesOptions) => {
  const streamingMessageIdSet = useMemo(() => new Set(streamingMessageIds), [streamingMessageIds]);
  const [pinnedStreamingMessageIds, setPinnedStreamingMessageIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setPinnedStreamingMessageIds((prev) =>
      prunePinnedStreamingMessageIds({
        dataSource,
        pinnedStreamingMessageIds: prev,
        streamingMessageIds: streamingMessageIdSet,
      }),
    );
  }, [dataSource, streamingMessageIdSet]);

  const trackVisibleStreamingItems = useCallback(() => {
    const virtua = getVirtua();
    if (!virtua || streamingMessageIdSet.size === 0) return;

    const visibleStreamingMessageIds = getVisibleStreamingMessageIds({
      dataSource,
      endIndex: virtua.findItemIndex(virtua.scrollOffset + virtua.viewportSize),
      startIndex: virtua.findItemIndex(virtua.scrollOffset),
      streamingMessageIds: streamingMessageIdSet,
    });

    if (visibleStreamingMessageIds.size === 0) return;

    setPinnedStreamingMessageIds((prev) => {
      const nextPinnedIds = new Set(prev);
      for (const id of visibleStreamingMessageIds) {
        nextPinnedIds.add(id);
      }

      return setsEqual(prev, nextPinnedIds) ? prev : nextPinnedIds;
    });
  }, [dataSource, getVirtua, streamingMessageIdSet]);

  useEffect(() => {
    trackVisibleStreamingItems();
  }, [trackVisibleStreamingItems]);

  const keepMountedIndices = useMemo(
    () =>
      getKeepMountedIndices({
        dataSource,
        pinnedStreamingMessageIds,
        selectionMessageIds,
      }),
    [dataSource, pinnedStreamingMessageIds, selectionMessageIds],
  );

  return {
    keepMountedIndices,
    trackVisibleStreamingItems,
  };
};
