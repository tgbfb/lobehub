import { formatExecuteCodeResult } from '@lobechat/prompts/fileSystem';
import { ComputerRuntime } from '@lobechat/tool-runtime';
import type { BuiltinServerRuntimeOutput } from '@lobechat/types';

import type {
  ExecuteCodeParams,
  ExecuteCodeState,
  ExportFileParams,
  ExportFileState,
  ISandboxService,
  SandboxCallToolResult,
} from '../types';

/**
 * The shared `ComputerRuntime` base now speaks the canonical **A** shape
 * (snake_case + `loc` tuple), aligned with the local-system tool args. The cloud
 * sandbox keeps its own legacy **B** manifest/UI (backward compatible) and the
 * remote sandbox SDK also speaks B — so this runtime is the single boundary that
 * bridges the two: it normalizes **B→A on entry** (so the A-base builds correct
 * `content`/`state`) and converts **A→B at `callService`** for the remote SDK.
 * All conversion stays on the (lower-frequency) cloud path (LOBE-9954); neither
 * the cloud tool contract nor the local path pays for it.
 *
 * The bridge lives here (not in the client executor) because the server runtime
 * also calls these runtime methods directly.
 */

/** Normalize the cloud sandbox's legacy **B** params into the canonical **A** shape. */
const normalizeFromSandbox = (toolName: string, params: Record<string, any>): any => {
  switch (toolName) {
    case 'listLocalFiles': {
      return {
        limit: params.limit,
        path: params.directoryPath,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      };
    }

    case 'readLocalFile': {
      const loc: [number, number] | undefined =
        params.startLine !== undefined || params.endLine !== undefined
          ? [params.startLine ?? 0, params.endLine ?? params.startLine ?? 0]
          : undefined;
      return { loc, path: params.path };
    }

    case 'editLocalFile': {
      return {
        file_path: params.path,
        new_string: params.replace,
        old_string: params.search,
        replace_all: params.all,
      };
    }

    case 'searchLocalFiles': {
      return {
        fileTypes: params.fileType ? [params.fileType] : undefined,
        keywords: params.keyword,
        modifiedAfter: params.modifiedAfter,
        modifiedBefore: params.modifiedBefore,
        scope: params.directory,
      };
    }

    case 'moveLocalFiles': {
      return {
        items: params.operations?.map((op: { destination: string; source: string }) => ({
          newPath: op.destination,
          oldPath: op.source,
        })),
      };
    }

    case 'runCommand': {
      return {
        command: params.command,
        description: params.description,
        run_in_background: params.background,
        timeout: params.timeout,
      };
    }

    case 'getCommandOutput': {
      return { shell_id: params.commandId };
    }

    case 'killCommand': {
      return { shell_id: params.commandId };
    }

    case 'grepContent': {
      return { glob: params.filePattern, pattern: params.pattern, scope: params.directory };
    }

    case 'globLocalFiles': {
      return { pattern: params.pattern, scope: params.directory };
    }

    default: {
      return params;
    }
  }
};

/** Convert the canonical **A** params back to the legacy **B** shape the remote sandbox SDK expects. */
const denormalizeForSandbox = (toolName: string, params: Record<string, any>): any => {
  switch (toolName) {
    case 'listLocalFiles': {
      return {
        directoryPath: params.path,
        limit: params.limit,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      };
    }

    case 'readLocalFile': {
      return { endLine: params.loc?.[1], path: params.path, startLine: params.loc?.[0] };
    }

    case 'editLocalFile': {
      return {
        all: params.replace_all,
        path: params.file_path,
        replace: params.new_string,
        search: params.old_string,
      };
    }

    case 'searchLocalFiles': {
      return {
        directory: params.scope,
        fileType: params.fileTypes?.[0],
        keyword: params.keywords,
        modifiedAfter: params.modifiedAfter,
        modifiedBefore: params.modifiedBefore,
      };
    }

    case 'moveLocalFiles': {
      return {
        operations: params.items?.map((item: { newPath: string; oldPath: string }) => ({
          destination: item.newPath,
          source: item.oldPath,
        })),
      };
    }

    case 'runCommand': {
      return {
        background: params.run_in_background,
        command: params.command,
        description: params.description,
        timeout: params.timeout,
      };
    }

    case 'getCommandOutput': {
      return { commandId: params.shell_id };
    }

    case 'killCommand': {
      return { commandId: params.shell_id };
    }

    case 'grepContent': {
      return { directory: params.scope, filePattern: params.glob, pattern: params.pattern };
    }

    case 'globLocalFiles': {
      return { directory: params.scope, pattern: params.pattern };
    }

    default: {
      // Cloud-specific tools (executeCode) already pass remote-shaped params.
      return params;
    }
  }
};

/**
 * Cloud Sandbox Execution Runtime
 *
 * Extends ComputerRuntime for standard computer operations (files, shell, search).
 * Adds cloud-specific capabilities: code execution and file export.
 *
 * Dependency Injection:
 * - Client: Inject codeInterpreterService (uses tRPC client)
 * - Server: Inject ServerSandboxService (uses MarketSDK directly)
 */
export class CloudSandboxExecutionRuntime extends ComputerRuntime {
  private sandboxService: ISandboxService;

  constructor(sandboxService: ISandboxService) {
    super();
    this.sandboxService = sandboxService;
  }

  // ─── B→A entry bridge ───
  // The manifest/executor still send the legacy B shape; map it to the A shape
  // the base methods consume so they build correct content/state.

  async listFiles(args: any): Promise<BuiltinServerRuntimeOutput> {
    return super.listFiles(normalizeFromSandbox('listLocalFiles', args));
  }

  async readFile(args: any): Promise<BuiltinServerRuntimeOutput> {
    return super.readFile(normalizeFromSandbox('readLocalFile', args));
  }

  async editFile(args: any): Promise<BuiltinServerRuntimeOutput> {
    return super.editFile(normalizeFromSandbox('editLocalFile', args));
  }

  async searchFiles(args: any): Promise<BuiltinServerRuntimeOutput> {
    return super.searchFiles(normalizeFromSandbox('searchLocalFiles', args));
  }

  async moveFiles(args: any): Promise<BuiltinServerRuntimeOutput> {
    return super.moveFiles(normalizeFromSandbox('moveLocalFiles', args));
  }

  async runCommand(args: any): Promise<BuiltinServerRuntimeOutput> {
    return super.runCommand(normalizeFromSandbox('runCommand', args));
  }

  async getCommandOutput(args: any): Promise<BuiltinServerRuntimeOutput> {
    return super.getCommandOutput(normalizeFromSandbox('getCommandOutput', args));
  }

  async killCommand(args: any): Promise<BuiltinServerRuntimeOutput> {
    return super.killCommand(normalizeFromSandbox('killCommand', args));
  }

  async grepContent(args: any): Promise<BuiltinServerRuntimeOutput> {
    return super.grepContent(normalizeFromSandbox('grepContent', args));
  }

  async globFiles(args: any): Promise<BuiltinServerRuntimeOutput> {
    return super.globFiles(normalizeFromSandbox('globLocalFiles', args));
  }

  // ─── A→B exit bridge ───

  protected async callService(
    toolName: string,
    params: Record<string, any>,
  ): Promise<SandboxCallToolResult> {
    return this.sandboxService.callTool(toolName, denormalizeForSandbox(toolName, params));
  }

  // ==================== Cloud-Specific: Code Execution ====================

  async executeCode(args: ExecuteCodeParams): Promise<BuiltinServerRuntimeOutput> {
    try {
      const language = args.language || 'python';
      const result = await this.callService('executeCode', {
        code: args.code,
        language,
      });

      const state: ExecuteCodeState = {
        error: result.result?.error,
        exitCode: result.result?.exitCode,
        language,
        output: result.result?.output,
        stderr: result.result?.stderr,
        success: result.success || false,
      };

      const content = formatExecuteCodeResult({
        error:
          result.result?.error ??
          (result.success ? undefined : result.error?.message || JSON.stringify(result.error)),
        exitCode: result.result?.exitCode,
        language,
        output: result.result?.output,
        stderr: result.result?.stderr,
        success: result.success || false,
      });

      return {
        content,
        state,
        success: true,
      };
    } catch (error) {
      console.error('executeCode error', error);
      return this.handleError(error);
    }
  }

  // ==================== Cloud-Specific: File Export ====================

  /**
   * Export a file from the sandbox to cloud storage
   */
  async exportFile(args: ExportFileParams): Promise<BuiltinServerRuntimeOutput> {
    try {
      const filename = args.path.split('/').pop() || 'exported_file';

      const result = await this.sandboxService.exportAndUploadFile(args.path, filename);

      const state: ExportFileState = {
        downloadUrl: result.success && result.url ? result.url : '',
        fileId: result.fileId,
        filename: result.filename,
        mimeType: result.mimeType,
        path: args.path,
        size: result.size,
        success: result.success,
      };

      if (!result.success) {
        return {
          content: `File export failed for ${filename}: ${
            result.error?.message || 'Failed to export file from sandbox'
          }`,
          state,
          success: true,
        };
      }

      return {
        content: `File exported successfully.\n\nFilename: ${filename}\nDownload URL: ${result.url}`,
        state,
        success: true,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
}
