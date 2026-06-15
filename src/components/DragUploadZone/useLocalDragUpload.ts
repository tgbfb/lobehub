import debug from 'debug';
import { useCallback } from 'react';

const log = debug('lobe-client:drag-upload:local');

export type DragContentKind = 'files' | 'folders' | 'mixed' | 'none';

export interface DroppedFolder {
  name: string;
  path: string;
}

export interface DroppedLocalPath {
  isDirectory: boolean;
  name: string;
  path: string;
}

export interface PartitionedDroppedItems {
  files: File[];
  folders: DroppedFolder[];
}

export interface PartitionedDroppedLocalPaths {
  files: File[];
  localPaths: DroppedLocalPath[];
}

/**
 * Resolve the absolute filesystem path of a dropped File in Electron.
 * Returns null when not running under Electron or the path cannot be resolved.
 */
const resolveElectronFilePath = (file: File): string | null => {
  const webUtils = (
    globalThis as unknown as {
      window?: { electron?: { webUtils?: { getPathForFile?: (file: File) => string } } };
    }
  ).window?.electron?.webUtils;
  if (!webUtils?.getPathForFile) {
    log('webUtils.getPathForFile unavailable on window.electron — folder path cannot be resolved');
    return null;
  }
  try {
    const result = webUtils.getPathForFile(file);
    if (!result) log('webUtils.getPathForFile returned empty for %s', file.name);
    return result || null;
  } catch (error) {
    log('webUtils.getPathForFile threw for %s: %O', file.name, error);
    return null;
  }
};

const getPathName = (path: string) => path.split(/[\\/]/).pop() || path;

const createDroppedLocalPath = ({
  entry,
  file,
  isDirectory,
  path,
}: {
  entry?: FileSystemEntry | null;
  file?: File | null;
  isDirectory: boolean;
  path: string;
}): DroppedLocalPath => ({
  isDirectory,
  name: file?.name || entry?.name || getPathName(path),
  path,
});

const safeGetEntry = (item: DataTransferItem): FileSystemEntry | null => {
  try {
    return item.webkitGetAsEntry();
  } catch {
    return null;
  }
};

/**
 * Process a FileSystemEntry recursively to extract all files
 */
const processEntry = async (entry: FileSystemEntry): Promise<File[]> => {
  return new Promise((resolve) => {
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file((file) => {
        resolve([file]);
      });
    } else if (entry.isDirectory) {
      const dirReader = (entry as FileSystemDirectoryEntry).createReader();
      dirReader.readEntries(async (entries) => {
        const filesPromises = entries.map((element) => processEntry(element));
        const fileArrays = await Promise.all(filesPromises);
        resolve(fileArrays.flat());
      });
    } else {
      resolve([]);
    }
  });
};

/**
 * Extract files from DataTransferItems, supporting both files and directories
 */
export const getFileListFromDataTransferItems = async (
  items: DataTransferItem[],
): Promise<File[]> => {
  const filePromises: Promise<File[]>[] = [];

  for (const item of items) {
    if (item.kind === 'file') {
      // Safari browser may throw error when using FileSystemFileEntry.file()
      // So we prioritize using getAsFile() method first for better browser compatibility
      const file = item.getAsFile();

      if (file) {
        filePromises.push(Promise.resolve([file]));
      } else {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          filePromises.push(processEntry(entry));
        }
      }
    }
  }

  const fileArrays = await Promise.all(filePromises);
  return fileArrays.flat();
};

/**
 * Inspect DataTransferItems synchronously (callable in dragenter / dragover)
 * to classify dragged content into 'files', 'folders', 'mixed', or 'none'.
 *
 * Browsers expose item.webkitGetAsEntry() during drag events with metadata
 * (isFile / isDirectory) accessible, even though content reads are gated to drop.
 */
export const detectDragContentKind = (items: DataTransferItemList | null): DragContentKind => {
  if (!items || items.length === 0) return 'none';

  let hasFolder = false;
  let hasFile = false;

  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue;
    const entry = safeGetEntry(item);
    if (entry?.isDirectory) {
      hasFolder = true;
    } else {
      hasFile = true;
    }
    if (hasFolder && hasFile) break;
  }

  if (hasFolder && hasFile) return 'mixed';
  if (hasFolder) return 'folders';
  if (hasFile) return 'files';
  return 'none';
};

/**
 * Partition dropped DataTransferItems into top-level folders (with absolute
 * filesystem paths via Electron's webUtils) and top-level files. Folders are
 * NOT recursed into — the caller is expected to treat them as mention targets.
 *
 * When a folder is encountered without an Electron path (e.g. running in
 * browser), it is skipped from the folders list — callers may still fall back
 * to upload by inspecting unhandled items.
 */
export const partitionDroppedItems = async (
  items: DataTransferItem[],
): Promise<PartitionedDroppedItems> => {
  const folders: DroppedFolder[] = [];
  const files: File[] = [];

  for (const item of items) {
    if (item.kind !== 'file') continue;

    const entry = safeGetEntry(item);

    if (entry?.isDirectory) {
      const directoryFile = item.getAsFile();
      const path = directoryFile ? resolveElectronFilePath(directoryFile) : null;
      if (path) {
        folders.push({
          name: directoryFile?.name || entry.name || path.split('/').pop() || path,
          path,
        });
        continue;
      }
      // Fallback (no Electron / no path): flatten the directory's files for
      // upload so the user isn't silently dropped.
      const flattened = await processEntry(entry);
      files.push(...flattened);
      continue;
    }

    const file = item.getAsFile();
    if (file) {
      files.push(file);
    } else if (entry) {
      const flattened = await processEntry(entry);
      files.push(...flattened);
    }
  }

  return { files, folders };
};

/**
 * Partition dropped/clipboard items for a local-filesystem chat context.
 *
 * Top-level files and folders with Electron-resolvable absolute paths become
 * local path references. Anything without a resolvable path falls back to the
 * existing upload flow so browser and failure cases still preserve the user's
 * dropped content.
 */
export const partitionDroppedItemsAsLocalPaths = async (
  items: DataTransferItem[],
): Promise<PartitionedDroppedLocalPaths> => {
  const localPaths: DroppedLocalPath[] = [];
  const files: File[] = [];

  for (const item of items) {
    if (item.kind !== 'file') continue;

    const entry = safeGetEntry(item);

    if (entry?.isDirectory) {
      const directoryFile = item.getAsFile();
      const path = directoryFile ? resolveElectronFilePath(directoryFile) : null;
      if (path) {
        localPaths.push(
          createDroppedLocalPath({ entry, file: directoryFile, isDirectory: true, path }),
        );
        continue;
      }

      const flattened = await processEntry(entry);
      files.push(...flattened);
      continue;
    }

    const file = item.getAsFile();
    if (file) {
      const path = resolveElectronFilePath(file);
      if (path) {
        localPaths.push(createDroppedLocalPath({ entry, file, isDirectory: false, path }));
      } else {
        files.push(file);
      }
    } else if (entry) {
      const flattened = await processEntry(entry);
      files.push(...flattened);
    }
  }

  return { files, localPaths };
};

export interface UseLocalDragUploadOptions {
  /**
   * Whether the drag upload is disabled
   */
  disabled?: boolean;
  /**
   * When true, top-level folders are routed to onLocalFolders instead of being
   * recursively flattened for upload. Top-level files still flow to onUploadFiles.
   * Requires Electron (uses webUtils.getPathForFile) to resolve folder paths.
   */
  enableLocalFolderMention?: boolean;
  /**
   * When true, top-level files and folders are routed to onLocalPaths instead
   * of being uploaded, as long as Electron can resolve an absolute path.
   * Unresolved items still fall back to upload.
   */
  enableLocalPathMention?: boolean;
  /**
   * Callback for top-level dropped folders when enableLocalFolderMention is on.
   */
  onLocalFolders?: (folders: DroppedFolder[]) => void | Promise<void>;
  /**
   * Callback for top-level dropped files/folders when enableLocalPathMention is on.
   */
  onLocalPaths?: (paths: DroppedLocalPath[]) => void | Promise<void>;
  /**
   * Callback when files are dropped
   */
  onUploadFiles: (files: File[]) => void | Promise<void>;
}

export interface UseLocalDragUploadResult {
  /**
   * Props to spread on the container element
   */
  getContainerProps: () => {
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

/**
 * Hook for handling local (container-scoped) drag and drop file uploads.
 *
 * This hook only handles dragOver (to allow drop) and drop events.
 * The global drag state is managed by DragUploadProvider.
 *
 * IMPORTANT: We intentionally do NOT call stopPropagation() to allow
 * events to bubble up to the window where DragUploadProvider listens.
 */
export const useLocalDragUpload = (
  options: UseLocalDragUploadOptions,
): UseLocalDragUploadResult => {
  const {
    onUploadFiles,
    disabled = false,
    enableLocalFolderMention,
    enableLocalPathMention,
    onLocalFolders,
    onLocalPaths,
  } = options;

  // Only preventDefault to allow drop, do NOT stopPropagation
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      if (!e.dataTransfer?.types.includes('Files')) return;

      e.preventDefault();
      // Do NOT call stopPropagation - let event bubble to Provider
    },
    [disabled],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      if (disabled) return;
      if (!e.dataTransfer?.items || e.dataTransfer.items.length === 0) return;

      const isFile = e.dataTransfer.types.includes('Files');
      if (!isFile) return;

      e.preventDefault();
      // Do NOT call stopPropagation - let event bubble to Provider

      const items = Array.from(e.dataTransfer.items);

      if (enableLocalPathMention && onLocalPaths) {
        const { files, localPaths } = await partitionDroppedItemsAsLocalPaths(items);
        log(
          'drop partitioned: %d local path(s), %d upload file(s)',
          localPaths.length,
          files.length,
        );
        if (localPaths.length > 0) {
          await onLocalPaths(localPaths);
        }
        if (files.length > 0) {
          await onUploadFiles(files);
        }
        return;
      }

      if (enableLocalFolderMention && onLocalFolders) {
        const { folders, files } = await partitionDroppedItems(items);
        log('drop partitioned: %d folder(s), %d file(s)', folders.length, files.length);
        if (folders.length > 0) {
          await onLocalFolders(folders);
        }
        if (files.length > 0) {
          await onUploadFiles(files);
        }
        return;
      }

      log('drop without folder-mention path, uploading files only');
      const files = await getFileListFromDataTransferItems(items);
      if (files.length === 0) return;
      await onUploadFiles(files);
    },
    [
      disabled,
      enableLocalFolderMention,
      enableLocalPathMention,
      onLocalFolders,
      onLocalPaths,
      onUploadFiles,
    ],
  );

  const getContainerProps = useCallback(
    () => ({
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    }),
    [handleDragOver, handleDrop],
  );

  return {
    getContainerProps,
  };
};
