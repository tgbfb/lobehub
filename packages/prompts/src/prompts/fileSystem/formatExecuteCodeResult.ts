export interface FormatExecuteCodeResultParams {
  error?: string;
  exitCode?: number;
  language?: string;
  output?: string;
  stderr?: string;
  success: boolean;
}

/**
 * Format a cloud-sandbox code-execution result into prompt text. Keeps the
 * model-facing payload human-readable instead of a raw `JSON.stringify` of the
 * service result.
 */
export const formatExecuteCodeResult = ({
  success,
  language,
  output,
  stderr,
  error,
  exitCode,
}: FormatExecuteCodeResultParams): string => {
  const parts: string[] = [];

  const hasNonZeroExit = exitCode !== undefined && exitCode !== 0;
  const failed = !success || hasNonZeroExit;

  if (failed) {
    let header = language ? `${language} execution failed` : 'Code execution failed';
    if (hasNonZeroExit) header += ` with exit code ${exitCode}`;
    if (error) header += `: ${error}`;
    parts.push(header);
  } else {
    parts.push(language ? `${language} executed successfully.` : 'Code executed successfully.');
  }

  if (output) parts.push(`Output:\n${output}`);
  if (stderr) parts.push(`Stderr:\n${stderr}`);

  return parts.join('\n\n');
};
