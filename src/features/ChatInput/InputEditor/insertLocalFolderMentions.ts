import type { IEditor } from '@lobehub/editor';
import { INSERT_MENTION_COMMAND } from '@lobehub/editor';
import { $getSelection, $isRangeSelection } from 'lexical';

import type { DroppedFolder, DroppedLocalPath } from '@/components/DragUploadZone';

/**
 * Insert one localFile mention node per local path at the editor's current
 * selection, separating consecutive mentions with a space so they read as
 * distinct tokens.
 *
 * Mirrors the metadata shape used by the `@`-menu local-file mention path so
 * the markdownWriter in InputEditor renders `<localFile name="..." path="..." />`.
 */
export const insertLocalPathMentions = (editor: IEditor, paths: DroppedLocalPath[]) => {
  if (paths.length === 0) return;

  const lexicalEditor = editor.getLexicalEditor();
  lexicalEditor?.focus();

  paths.forEach((item, index) => {
    if (index > 0) {
      lexicalEditor?.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertText(' ');
        }
      });
    }
    editor.dispatchCommand(INSERT_MENTION_COMMAND, {
      label: item.name,
      metadata: {
        isDirectory: item.isDirectory,
        name: item.name,
        path: item.path,
        type: 'localFile',
      },
    });
  });

  // Trailing space so the user can keep typing without manually adding one.
  lexicalEditor?.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      selection.insertText(' ');
    }
  });
};

export const insertLocalFolderMentions = (editor: IEditor, folders: DroppedFolder[]) =>
  insertLocalPathMentions(
    editor,
    folders.map((folder) => ({ ...folder, isDirectory: true })),
  );
