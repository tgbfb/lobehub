/* eslint-disable @typescript-eslint/consistent-type-imports */
import type { HeadlessLiteXMLOperation } from '@lobehub/editor/headless';
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import { EMPTY_EDITOR_STATE } from '@/libs/editor/constants';
import { isValidEditorData } from '@/libs/editor/isValidEditorData';

export type AgentDocumentEditorData = Record<string, any>;

export type AgentDocumentLiteXMLOperation =
  | {
      action: 'insert';
      afterId: string;
      litexml: string;
    }
  | {
      action: 'insert';
      beforeId: string;
      litexml: string;
    }
  | {
      action: 'modify';
      litexml: string | string[];
    }
  | {
      action: 'remove';
      id: string;
    };

const orderLiteXMLOperations = (
  operations: AgentDocumentLiteXMLOperation[],
): AgentDocumentLiteXMLOperation[] => {
  const orderedOperations: AgentDocumentLiteXMLOperation[] = [];

  for (const operation of operations) {
    if (operation.action === 'insert') {
      orderedOperations.unshift(operation);
    } else {
      orderedOperations.push(operation);
    }
  }

  return orderedOperations;
};

const toHeadlessLiteXMLOperation = (
  operation: AgentDocumentLiteXMLOperation,
): HeadlessLiteXMLOperation => {
  switch (operation.action) {
    case 'insert': {
      return 'beforeId' in operation
        ? {
            action: 'insert',
            beforeId: operation.beforeId,
            delay: true,
            litexml: operation.litexml,
          }
        : {
            action: 'insert',
            afterId: operation.afterId,
            delay: true,
            litexml: operation.litexml,
          };
    }

    case 'modify': {
      return {
        action: 'replace',
        delay: true,
        litexml: operation.litexml,
      };
    }

    case 'remove': {
      return {
        action: 'remove',
        delay: true,
        id: operation.id,
      };
    }
  }
};

export interface AgentDocumentEditorSnapshot {
  content: string;
  editorData: AgentDocumentEditorData;
  litexml?: string;
}

interface LoadEditorStateParams {
  editorData?: AgentDocumentEditorData | null;
  fallbackContent?: string;
}

interface LiteXMLNodeIdRef {
  id: string;
  tag: string;
}

const liteXMLOpeningTagPattern = /<([a-z][\w:-]*)\b([^>]*)>/gi;
const liteXMLIdAttributePattern = /\sid="([^"]+)"/;
const liteXMLIdAttributeGlobalPattern = /\sid="([^"]+)"/g;

const extractLiteXMLIdRefs = (litexml?: string): LiteXMLNodeIdRef[] => {
  if (!litexml) return [];

  return [...litexml.matchAll(liteXMLOpeningTagPattern)].flatMap((match) => {
    const id = match[2].match(liteXMLIdAttributePattern)?.[1];

    return id ? [{ id, tag: match[1] }] : [];
  });
};

const collectEditorDataIds = (node: unknown, ids: string[] = []) => {
  if (!node || typeof node !== 'object') return ids;

  const record = node as Record<string, unknown>;
  if (record.root && typeof record.root === 'object') {
    return collectEditorDataIds(record.root, ids);
  }

  if (typeof record.id === 'string' && record.type !== 'root') {
    ids.push(record.id);
  }

  const children = record.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      collectEditorDataIds(child, ids);
    }
  }

  return ids;
};

/**
 * Normalizes LiteXML ids to stable editorData ids.
 *
 * Before:
 * - `<p id="runtime-a"><span id="runtime-b">Original</span></p>`
 *
 * After:
 * - `<p id="1"><span id="2">Original</span></p>`
 */
const normalizeLiteXMLIds = (litexml: string | undefined, editorData: unknown) => {
  if (!litexml) return litexml;

  const editorDataIds = collectEditorDataIds(editorData);
  let index = 0;

  return litexml.replaceAll(liteXMLOpeningTagPattern, (match, tag, attributes) => {
    const stableId = editorDataIds[index];
    const id = attributes.match(liteXMLIdAttributePattern)?.[1];

    if (!id) return match;

    index += 1;

    return stableId
      ? `<${tag}${attributes.replaceAll(liteXMLIdAttributeGlobalPattern, ` id="${stableId}"`)}>`
      : match;
  });
};

const createLiteXMLIdMap = (
  stableLiteXML: string | undefined,
  runtimeLiteXML: string | undefined,
) => {
  const stableRefs = extractLiteXMLIdRefs(stableLiteXML);
  const runtimeRefs = extractLiteXMLIdRefs(runtimeLiteXML);
  const idMap = new Map<string, string>();

  for (const [index, stableRef] of stableRefs.entries()) {
    const runtimeRef = runtimeRefs[index];

    if (!runtimeRef || runtimeRef.tag !== stableRef.tag) continue;
    idMap.set(stableRef.id, runtimeRef.id);
  }

  return idMap;
};

const mapLiteXMLId = (idMap: Map<string, string>, id: string) => idMap.get(id) ?? id;

const remapLiteXMLIds = (idMap: Map<string, string>, litexml: string) =>
  litexml.replaceAll(/\sid="([^"]+)"/g, (match, id) => ` id="${mapLiteXMLId(idMap, id)}"`);

const remapLiteXMLOperations = (
  operations: AgentDocumentLiteXMLOperation[],
  idMap: Map<string, string>,
): AgentDocumentLiteXMLOperation[] =>
  operations.map((operation) => {
    if (operation.action === 'remove') {
      return { ...operation, id: mapLiteXMLId(idMap, operation.id) };
    }

    if (operation.action === 'modify') {
      return {
        ...operation,
        litexml: Array.isArray(operation.litexml)
          ? operation.litexml.map((litexml) => remapLiteXMLIds(idMap, litexml))
          : remapLiteXMLIds(idMap, operation.litexml),
      };
    }

    return 'beforeId' in operation
      ? { ...operation, beforeId: mapLiteXMLId(idMap, operation.beforeId) }
      : { ...operation, afterId: mapLiteXMLId(idMap, operation.afterId) };
  });

const exportSnapshot = (
  editor: ReturnType<(typeof import('@lobehub/editor/headless'))['createHeadlessEditor']>,
  litexml = false,
): AgentDocumentEditorSnapshot => {
  const snapshot = editor.export({ litexml });

  return {
    content: snapshot.markdown,
    editorData: snapshot.editorData as SerializedEditorState<SerializedLexicalNode>,
    litexml: normalizeLiteXMLIds(snapshot.litexml, snapshot.editorData),
  };
};

const hydrateMarkdownOrEmptyState = (
  editor: ReturnType<(typeof import('@lobehub/editor/headless'))['createHeadlessEditor']>,
  content: string,
  options?: { keepId?: boolean },
) => {
  if (content.trim().length === 0) {
    editor.hydrateEditorData(
      EMPTY_EDITOR_STATE as unknown as SerializedEditorState<SerializedLexicalNode>,
      options,
    );
    return;
  }

  editor.hydrateMarkdown(content, options);
};

const loadEditorState = (
  editor: ReturnType<(typeof import('@lobehub/editor/headless'))['createHeadlessEditor']>,
  { editorData, fallbackContent = '' }: LoadEditorStateParams,
) => {
  if (isValidEditorData(editorData)) {
    // NOTICE:
    // @lobehub/editor@4.9.3 headless JSON hydration breaks when `keepId: true`
    // is passed for editorData exported by the same headless editor.
    // Root cause: the editor's JSONDataSource tries to preserve Lexical node ids,
    // then Lexical 0.42 fails while appending parsed children
    // (`ElementNode.splice: start + deleteCount > oldSize`) and leaves an empty
    // document. Instead, this adapter normalizes exported LiteXML ids to stable
    // editorData ids and remaps them back to runtime ids before applyLiteXML.
    // Example read-only flow:
    //   editorData -> hydrate -> export markdown for Context Engine / LLM reads.
    // Example LiteXML patch flow:
    //   readDocument exports `<span id="node-1">Original</span>`, then a tool
    //   sends `<span id="node-1">Updated</span>`. Before applyLiteXML, we map
    //   stable `node-1` to the runtime id generated by the current hydrate.
    // Removal condition: @lobehub/editor fixes keepId JSON hydration for
    // headless editorData round-trips.
    editor.hydrateEditorData(editorData as unknown as SerializedEditorState<SerializedLexicalNode>);
    return;
  }

  hydrateMarkdownOrEmptyState(editor, fallbackContent, { keepId: true });
};

export const createMarkdownEditorSnapshot = async (
  content: string,
): Promise<AgentDocumentEditorSnapshot> => {
  const { createHeadlessEditor } = await import('@lobehub/editor/headless');
  const editor = createHeadlessEditor();

  try {
    hydrateMarkdownOrEmptyState(editor, content);
    return exportSnapshot(editor);
  } finally {
    editor.destroy();
  }
};

export const exportEditorDataSnapshot = async (
  params: LoadEditorStateParams & { litexml?: boolean },
): Promise<AgentDocumentEditorSnapshot> => {
  const { createHeadlessEditor } = await import('@lobehub/editor/headless');
  const editor = createHeadlessEditor();

  try {
    loadEditorState(editor, params);
    return exportSnapshot(editor, params.litexml);
  } finally {
    editor.destroy();
  }
};

export const applyLiteXMLOperations = async ({
  editorData,
  fallbackContent,
  operations,
}: LoadEditorStateParams & {
  operations: AgentDocumentLiteXMLOperation[];
}): Promise<AgentDocumentEditorSnapshot> => {
  const { createHeadlessEditor } = await import('@lobehub/editor/headless');
  const editor = createHeadlessEditor();

  try {
    loadEditorState(editor, { editorData, fallbackContent });

    const runtimeSnapshot = editor.export({ litexml: true });
    const stableLiteXML = normalizeLiteXMLIds(runtimeSnapshot.litexml, editorData);
    const idMap = createLiteXMLIdMap(stableLiteXML, runtimeSnapshot.litexml);
    const remappedOperations = remapLiteXMLOperations(operations, idMap);

    await editor.applyLiteXML(
      orderLiteXMLOperations(remappedOperations).map(toHeadlessLiteXMLOperation),
    );
    return exportSnapshot(editor, true);
  } finally {
    editor.destroy();
  }
};
