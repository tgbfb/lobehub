import { describe, expect, it } from 'vitest';

import { formatExecuteCodeResult } from './formatExecuteCodeResult';

describe('formatExecuteCodeResult', () => {
  it('formats a successful run with output', () => {
    const result = formatExecuteCodeResult({
      language: 'python',
      output: 'hello\nworld',
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`
      "python executed successfully.

      Output:
      hello
      world"
    `);
  });

  it('formats success without a language label', () => {
    const result = formatExecuteCodeResult({ output: '42', success: true });
    expect(result).toMatchInlineSnapshot(`
      "Code executed successfully.

      Output:
      42"
    `);
  });

  it('treats a non-zero exit code as failure even when the envelope succeeded', () => {
    const result = formatExecuteCodeResult({
      exitCode: 1,
      language: 'javascript',
      stderr: 'ReferenceError: x is not defined',
      success: true,
    });
    expect(result).toMatchInlineSnapshot(`
      "javascript execution failed with exit code 1

      Stderr:
      ReferenceError: x is not defined"
    `);
  });

  it('includes the error message on failure', () => {
    const result = formatExecuteCodeResult({
      error: 'sandbox timed out',
      language: 'python',
      success: false,
    });
    expect(result).toMatchInlineSnapshot(`"python execution failed: sandbox timed out"`);
  });
});
