/**
 * Normalized result returned by the service layer.
 * Each ComputerRuntime subclass maps its raw service response into this shape.
 */
export interface ServiceResult {
  error?: { message: string; name?: string };
  result: any;
  success: boolean;
}

// ==================== Params ====================
//
// Canonical param shape (**A**): snake_case + `loc` tuple, anchored on the
// wire/manifest + `@lobechat/local-file-shell` contract. The high-frequency
// local path forwards these straight through to the underlying functions with
// zero camel↔snake conversion; the cloud sandbox runtime adapts A→B at its own
// `callService` boundary (the remote SDK still speaks B). See LOBE-9954.

export interface ListFilesParams {
  limit?: number;
  path: string;
  sortBy?: string;
  sortOrder?: string;
}

export interface ReadFileParams {
  /** Return the entire file, ignoring `loc`. */
  fullContent?: boolean;
  /** Line range to read as a tuple [startLine, endLine]. */
  loc?: [number, number];
  path: string;
}

export interface WriteFileParams {
  content: string;
  createDirectories?: boolean;
  path: string;
}

export interface EditFileParams {
  file_path: string;
  new_string: string;
  old_string: string;
  replace_all?: boolean;
}

export interface SearchFilesParams {
  contentContains?: string;
  createdAfter?: string;
  createdBefore?: string;
  detailed?: boolean;
  /** @deprecated Legacy alias for `scope`. */
  directory?: string;
  exclude?: string[];
  /** @deprecated Prefer `fileTypes` (plural). Retained for cloud sandbox back-compat. */
  fileType?: string;
  fileTypes?: string[];
  keywords: string;
  limit?: number;
  liveUpdate?: boolean;
  modifiedAfter?: string;
  modifiedBefore?: string;
  scope?: string;
  sortBy?: 'name' | 'date' | 'size';
  sortDirection?: 'asc' | 'desc';
}

export interface MoveFilesParams {
  items: Array<{
    newPath: string;
    oldPath: string;
  }>;
}

export interface RenameFileParams {
  newName: string;
  path: string;
}

export interface GlobFilesParams {
  /** Legacy alias for `scope`. */
  cwd?: string;
  pattern: string;
  /** Working directory scope. Relative patterns are resolved against it. */
  scope?: string;
}

export interface RunCommandParams {
  command: string;
  description?: string;
  env?: Record<string, string>;
  run_in_background?: boolean;
  timeout?: number;
}

export interface GetCommandOutputParams {
  filter?: string;
  shell_id: string;
  /**
   * Max time to wait for this observation before returning (does not kill the
   * process). Forwarded to the service so callers polling a running command can
   * honor a per-call/gateway budget instead of the service's default wait.
   */
  timeout?: number;
}

export interface KillCommandParams {
  shell_id: string;
}

export interface GrepContentParams {
  '-A'?: number;
  '-B'?: number;
  '-C'?: number;
  '-i'?: boolean;
  '-n'?: boolean;
  /** @deprecated Legacy alias for `glob`. */
  'filePattern'?: string;
  'glob'?: string;
  'head_limit'?: number;
  'multiline'?: boolean;
  'output_mode'?: 'content' | 'count' | 'files_with_matches';
  'pattern': string;
  'scope'?: string;
  'type'?: string;
}

// ==================== State ====================

export interface ListFilesState {
  files: Array<{
    isDirectory: boolean;
    name: string;
    path?: string;
    size?: number;
  }>;
  totalCount?: number;
}

export interface ReadFileState {
  /** Character count of the returned content */
  charCount?: number;
  content: string;
  endLine?: number;
  /** Base filename extracted from path */
  filename?: string;
  /** Detected file type (e.g., 'ts', 'md', 'json') */
  fileType?: string;
  /** Line range as tuple [start, end] */
  loc?: [number, number];
  path: string;
  startLine?: number;
  /** Total character count of the entire file */
  totalCharCount?: number;
  /** Total line count of the entire file */
  totalLines?: number;
}

export interface WriteFileState {
  bytesWritten?: number;
  path: string;
  success: boolean;
}

export interface EditFileState {
  diffText?: string;
  linesAdded?: number;
  linesDeleted?: number;
  path: string;
  replacements: number;
}

export interface SearchFilesState {
  results: Array<{
    isDirectory?: boolean;
    modifiedAt?: string;
    name?: string;
    path: string;
    size?: number;
  }>;
  totalCount: number;
}

export interface MoveFilesState {
  results: Array<{
    destination?: string;
    error?: string;
    source?: string;
    success: boolean;
  }>;
  successCount: number;
  totalCount: number;
}

export interface RenameFileState {
  error?: string;
  newPath: string;
  oldPath: string;
  success: boolean;
}

export interface GlobFilesState {
  files: string[];
  pattern: string;
  totalCount: number;
}

export interface RunCommandState {
  commandId?: string;
  error?: string;
  exitCode?: number;
  isBackground: boolean;
  output?: string;
  stderr?: string;
  stdout?: string;
  success: boolean;
}

export interface GetCommandOutputState {
  error?: string;
  exitCode?: number;
  newOutput?: string;
  success: boolean;
}

export interface KillCommandState {
  commandId: string;
  error?: string;
  success: boolean;
}

export interface GrepContentState {
  matches: Array<string | { content?: string; lineNumber?: number; path: string }>;
  pattern: string;
  totalMatches: number;
}
