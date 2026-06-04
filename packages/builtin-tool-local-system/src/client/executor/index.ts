import type {
  EditLocalFileParams,
  GetCommandOutputParams,
  GlobFilesParams,
  GrepContentParams,
  KillCommandParams,
  ListLocalFileParams,
  LocalReadFileParams,
  LocalReadFilesParams,
  LocalSearchFilesParams,
  MoveLocalFilesParams,
  RunCommandParams,
  WriteLocalFileParams,
} from '@lobechat/electron-client-ipc';
import { LocalSystemExecutionRuntime } from '@lobechat/tool-runtime';
import type { BuiltinToolResult } from '@lobechat/types';
import { BaseExecutor } from '@lobechat/types';

import { localFileService } from '@/services/electron/localFileService';

import { LocalSystemIdentifier } from '../../types';
import { resolveArgsWithScope } from '../../utils/path';

const LocalSystemApiEnum = {
  editFile: 'editFile' as const,
  getCommandOutput: 'getCommandOutput' as const,
  globFiles: 'globFiles' as const,
  grepContent: 'grepContent' as const,
  killCommand: 'killCommand' as const,
  listFiles: 'listFiles' as const,
  moveFiles: 'moveFiles' as const,
  readFile: 'readFile' as const,
  readFiles: 'readFiles' as const,
  runCommand: 'runCommand' as const,
  searchFiles: 'searchFiles' as const,
  writeFile: 'writeFile' as const,
};

/**
 * Local System Tool Executor
 *
 * Delegates standard computer operations to LocalSystemExecutionRuntime (extends ComputerRuntime).
 * Handles scope resolution for paths before delegating.
 */
class LocalSystemExecutor extends BaseExecutor<typeof LocalSystemApiEnum> {
  readonly identifier = LocalSystemIdentifier;
  protected readonly apiEnum = LocalSystemApiEnum;

  private runtime = new LocalSystemExecutionRuntime(localFileService);

  /**
   * Convert BuiltinServerRuntimeOutput to BuiltinToolResult.
   *
   * Single funnel for every executor return — keep it strict:
   * - never propagate an undefined `content` (would collapse downstream into
   *   `''` and leave the Debug "Response" pane blank while pluginState was
   *   still saved — see globFiles regression);
   * - always preserve `state` when the runtime produced one, regardless of
   *   `success`, so renderers can keep displaying partial outputs on failure.
   */
  private toResult(output: {
    content: string;
    error?: any;
    state?: any;
    success: boolean;
  }): BuiltinToolResult {
    const errorMessage =
      typeof output.error?.message === 'string' ? output.error.message : undefined;
    const safeContent =
      output.content || errorMessage || '[UNKNOWN_EXEC_ERROR] Tool execution failed';

    if (!output.success) {
      return {
        content: safeContent,
        error: output.error
          ? { body: output.error, message: errorMessage ?? safeContent, type: 'PluginServerError' }
          : undefined,
        state: output.state,
        success: false,
      };
    }
    return { content: safeContent, state: output.state, success: true };
  }

  // ==================== File Operations ====================

  listFiles = async (params: ListLocalFileParams): Promise<BuiltinToolResult> => {
    try {
      const result = await this.runtime.listFiles(params as any);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  readFile = async (params: LocalReadFileParams): Promise<BuiltinToolResult> => {
    try {
      const result = await this.runtime.readFile(params as any);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  readFiles = async (params: LocalReadFilesParams): Promise<BuiltinToolResult> => {
    try {
      const result = await this.runtime.readFiles(params);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  searchFiles = async (params: LocalSearchFilesParams): Promise<BuiltinToolResult> => {
    try {
      const resolvedParams = resolveArgsWithScope(params, 'directory');
      const result = await this.runtime.searchFiles({
        ...resolvedParams,
        directory: resolvedParams.directory || '',
      });
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  moveFiles = async (params: MoveLocalFilesParams): Promise<BuiltinToolResult> => {
    try {
      const result = await this.runtime.moveFiles(params as any);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  writeFile = async (params: WriteLocalFileParams): Promise<BuiltinToolResult> => {
    try {
      const result = await this.runtime.writeFile(params);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  editFile = async (params: EditLocalFileParams): Promise<BuiltinToolResult> => {
    try {
      const result = await this.runtime.editFile(params as any);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  // ==================== Shell Commands ====================

  runCommand = async (params: RunCommandParams): Promise<BuiltinToolResult> => {
    try {
      const result = await this.runtime.runCommand(params as any);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  getCommandOutput = async (params: GetCommandOutputParams): Promise<BuiltinToolResult> => {
    try {
      const result = await this.runtime.getCommandOutput(params as any);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  killCommand = async (params: KillCommandParams): Promise<BuiltinToolResult> => {
    try {
      const result = await this.runtime.killCommand(params as any);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  // ==================== Search & Find ====================

  grepContent = async (params: GrepContentParams): Promise<BuiltinToolResult> => {
    try {
      const resolvedParams = resolveArgsWithScope(params, 'path');
      // Forward the full IPC params (glob / output_mode / -i / -A / -B / -C / -n /
      // multiline / head_limit / type / tool) instead of stripping to {directory, pattern}.
      // ComputerRuntime.callService passes args through unchanged, so the runtime type
      // narrowing was the only blocker — the underlying rg/grep needs these flags to
      // honor the agent's filter and stop scanning dist/* and tsbuildinfo.
      const result = await this.runtime.grepContent(resolvedParams as any);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  globFiles = async (params: GlobFilesParams): Promise<BuiltinToolResult> => {
    try {
      const result = await this.runtime.globFiles(params as any);
      return this.toResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  };

  // ==================== Helpers ====================

  private errorResult(error: unknown): BuiltinToolResult {
    return {
      content: (error as Error).message,
      error: { body: error, message: (error as Error).message, type: 'PluginServerError' },
      success: false,
    };
  }
}

// Export the executor instance for registration
export const localSystemExecutor = new LocalSystemExecutor();
