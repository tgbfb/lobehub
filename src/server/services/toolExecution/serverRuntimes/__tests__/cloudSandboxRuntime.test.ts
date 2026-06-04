import { CloudSandboxExecutionRuntime } from '@lobechat/builtin-tool-cloud-sandbox';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The shared ComputerRuntime base now speaks the canonical **A** shape, but the
 * cloud sandbox keeps its legacy **B** manifest and the remote SDK also speaks B.
 * CloudSandboxExecutionRuntime bridges the two: it normalizes B→A on entry (so
 * the A-base builds correct content/state) and converts A→B at `callService` for
 * the remote. End to end the legacy B contract must round-trip unchanged — these
 * tests lock that (LOBE-9954).
 */
const makeRuntime = () => {
  const callTool = vi.fn().mockResolvedValue({ result: {}, success: true });
  const exportAndUploadFile = vi.fn();
  const runtime = new CloudSandboxExecutionRuntime({ callTool, exportAndUploadFile } as any);
  return { callTool, runtime };
};

describe('CloudSandboxExecutionRuntime — legacy B params round-trip to the remote SDK', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listFiles: directoryPath preserved', async () => {
    const { callTool, runtime } = makeRuntime();
    await runtime.listFiles({ directoryPath: '/tmp', sortBy: 'name' } as any);
    expect(callTool).toHaveBeenCalledWith(
      'listLocalFiles',
      expect.objectContaining({ directoryPath: '/tmp', sortBy: 'name' }),
    );
  });

  it('readFile: startLine/endLine preserved', async () => {
    const { callTool, runtime } = makeRuntime();
    await runtime.readFile({ endLine: 20, path: '/a.ts', startLine: 10 } as any);
    expect(callTool).toHaveBeenCalledWith(
      'readLocalFile',
      expect.objectContaining({ endLine: 20, path: '/a.ts', startLine: 10 }),
    );
  });

  it('editFile: path/search/replace/all preserved', async () => {
    const { callTool, runtime } = makeRuntime();
    await runtime.editFile({ all: true, path: '/a.ts', replace: 'b', search: 'a' } as any);
    expect(callTool).toHaveBeenCalledWith('editLocalFile', {
      all: true,
      path: '/a.ts',
      replace: 'b',
      search: 'a',
    });
  });

  it('searchFiles: directory/keyword/fileType preserved', async () => {
    const { callTool, runtime } = makeRuntime();
    await runtime.searchFiles({ directory: '/src', fileType: 'ts', keyword: 'foo' } as any);
    expect(callTool).toHaveBeenCalledWith(
      'searchLocalFiles',
      expect.objectContaining({ directory: '/src', fileType: 'ts', keyword: 'foo' }),
    );
  });

  it('moveFiles: operations[{source,destination}] preserved', async () => {
    const { callTool, runtime } = makeRuntime();
    await runtime.moveFiles({ operations: [{ destination: '/b', source: '/a' }] } as any);
    expect(callTool).toHaveBeenCalledWith('moveLocalFiles', {
      operations: [{ destination: '/b', source: '/a' }],
    });
  });

  it('runCommand: background preserved', async () => {
    const { callTool, runtime } = makeRuntime();
    await runtime.runCommand({ background: true, command: 'ls' } as any);
    expect(callTool).toHaveBeenCalledWith(
      'runCommand',
      expect.objectContaining({ background: true, command: 'ls' }),
    );
  });

  it('getCommandOutput / killCommand: commandId preserved', async () => {
    const { callTool, runtime } = makeRuntime();
    await runtime.getCommandOutput({ commandId: 'sh-1' } as any);
    expect(callTool).toHaveBeenCalledWith('getCommandOutput', { commandId: 'sh-1' });
    await runtime.killCommand({ commandId: 'sh-1' } as any);
    expect(callTool).toHaveBeenCalledWith('killCommand', { commandId: 'sh-1' });
  });

  it('grepContent: directory/filePattern preserved', async () => {
    const { callTool, runtime } = makeRuntime();
    await runtime.grepContent({ directory: '/src', filePattern: '*.ts', pattern: 'x' } as any);
    expect(callTool).toHaveBeenCalledWith('grepContent', {
      directory: '/src',
      filePattern: '*.ts',
      pattern: 'x',
    });
  });

  it('globFiles: directory preserved', async () => {
    const { callTool, runtime } = makeRuntime();
    await runtime.globFiles({ directory: '/src', pattern: '**/*.ts' } as any);
    expect(callTool).toHaveBeenCalledWith('globLocalFiles', {
      directory: '/src',
      pattern: '**/*.ts',
    });
  });
});

describe('CloudSandboxExecutionRuntime.executeCode — formatter instead of raw JSON', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes the result through the formatter (not JSON.stringify)', async () => {
    const callTool = vi
      .fn()
      .mockResolvedValue({ result: { exitCode: 0, output: 'hello' }, success: true });
    const runtime = new CloudSandboxExecutionRuntime({
      callTool,
      exportAndUploadFile: vi.fn(),
    } as any);

    const out = await runtime.executeCode({ code: 'print(1)', language: 'python' });

    expect(out.content).toContain('python executed successfully.');
    expect(out.content).toContain('hello');
    expect(out.content).not.toContain('{"');
  });
});
