import path from 'node:path';

import type {
  EditFileParams,
  GetCommandOutputParams,
  GlobFilesParams,
  GrepContentParams,
  KillCommandParams,
  ListFilesParams,
  ReadFileParams,
  RunCommandParams,
  SearchFilesParams,
  WriteFileParams,
} from '@lobechat/local-file-shell';
import { type ILocalSystemService, LocalSystemExecutionRuntime } from '@lobechat/tool-runtime';

import {
  editLocalFile,
  globLocalFiles,
  grepContent,
  listLocalFiles,
  readLocalFile,
  searchLocalFiles,
  writeLocalFile,
} from './file';
import { getCommandOutput, killCommand, runCommand } from './shell';

/**
 * Output envelope produced by {@link runLocalSystemTool}. Mirrors
 * `@lobechat/types`' `BuiltinServerRuntimeOutput`: `content` is the formatted
 * prompt text fed to the LLM, while `state` carries the structured payload that
 * client renders consume as `pluginState`.
 */
export interface LocalSystemToolOutput {
  content: string;
  error?: unknown;
  state?: unknown;
  success: boolean;
}

/**
 * Stub for `ILocalSystemService` methods the CLI does not expose (batch read,
 * move, rename). These are never routed by {@link runLocalSystemTool}; the
 * interface just requires them, so we fail loudly if one is ever reached.
 */
const unsupported = (method: string) => (): Promise<never> =>
  Promise.reject(new Error(`${method} is not supported by the LobeHub CLI`));

/**
 * Adapter wiring the CLI's `@lobechat/local-file-shell` functions (file ops) and
 * shell wrappers (with the shared `ShellProcessManager`) into the shape the
 * runtime expects. The runtime forwards its canonical A-shape params straight to
 * these functions with zero conversion — see `LocalSystemExecutionRuntime`.
 */
const localSystemService: ILocalSystemService = {
  editLocalFile,
  getCommandOutput,
  globFiles: globLocalFiles,
  grepContent,
  killCommand,
  listLocalFiles,
  moveLocalFiles: unsupported('moveLocalFiles'),
  readLocalFile,
  readLocalFiles: unsupported('readLocalFiles'),
  renameLocalFile: unsupported('renameLocalFile'),
  runCommand,
  searchLocalFiles,
  writeFile: writeLocalFile,
};

const runtime = new LocalSystemExecutionRuntime(localSystemService);

/**
 * Legacy API name aliases used by older gateway versions. Normalized to the
 * current tool names before dispatch.
 */
const LEGACY_API_ALIASES: Record<string, string> = {
  editLocalFile: 'editFile',
  globLocalFiles: 'globFiles',
  listLocalFiles: 'listFiles',
  readLocalFile: 'readFile',
  searchLocalFiles: 'searchFiles',
  writeLocalFile: 'writeFile',
};

/**
 * Resolve a relative path against a scope (CWD). Mirrors the desktop gateway's
 * inline copy of the renderer-side `resolveArgsWithScope` helper so the CLI and
 * desktop produce identical scoping for search/grep tools.
 */
const resolveArgsWithScope = <T extends { scope?: string }>(args: T, pathField: string): T => {
  const scope = args.scope;
  const bag = args as Record<PropertyKey, unknown>;
  const currentPath = typeof bag[pathField] === 'string' ? (bag[pathField] as string) : undefined;
  if (!scope) return args;
  if (!currentPath) return { ...args, [pathField]: scope };
  if (path.isAbsolute(currentPath)) return args;
  return { ...args, [pathField]: path.join(scope, currentPath) };
};

/**
 * Route file/shell tool calls through `LocalSystemExecutionRuntime` so the
 * result carries structured `state` (for client renders) and `content` is the
 * formatted prompt text — matching the desktop gateway path (PR #15114).
 *
 * Returns `null` when `apiName` is not a local-system tool, so the caller can
 * fall back to CLI-only tools (platform agents).
 */
export async function runLocalSystemTool(
  apiName: string,
  args: Record<string, any>,
): Promise<LocalSystemToolOutput | null> {
  const normalized = LEGACY_API_ALIASES[apiName] ?? apiName;

  // The runtime now consumes the canonical A shape (same as the wire/manifest
  // and `@lobechat/local-file-shell`), so every case forwards `args` straight
  // through — only scope resolution (search/grep) is applied first.
  switch (normalized) {
    case 'listFiles': {
      return runtime.listFiles(args as ListFilesParams);
    }

    case 'readFile': {
      return runtime.readFile(args as ReadFileParams);
    }

    case 'writeFile': {
      return runtime.writeFile(args as WriteFileParams);
    }

    case 'editFile': {
      return runtime.editFile(args as EditFileParams);
    }

    case 'searchFiles': {
      const resolved = resolveArgsWithScope(
        args as SearchFilesParams & { scope?: string },
        'directory',
      );
      return runtime.searchFiles({ ...resolved, directory: resolved.directory || '' } as never);
    }

    case 'grepContent': {
      const resolved = resolveArgsWithScope(args as GrepContentParams, 'path');
      return runtime.grepContent(resolved as never);
    }

    case 'globFiles': {
      return runtime.globFiles(args as GlobFilesParams);
    }

    case 'runCommand': {
      return runtime.runCommand(args as RunCommandParams);
    }

    case 'getCommandOutput': {
      // `timeout` (gateway per-call budget, injected into args by
      // executeToolCall) flows through unchanged so polling honors it.
      return runtime.getCommandOutput(args as GetCommandOutputParams);
    }

    case 'killCommand': {
      return runtime.killCommand(args as KillCommandParams);
    }

    default: {
      return null;
    }
  }
}
