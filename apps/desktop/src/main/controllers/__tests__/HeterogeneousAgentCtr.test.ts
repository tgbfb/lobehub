import { EventEmitter } from 'node:events';
import { access, mkdtemp, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { HeterogeneousAgentSessionErrorCode } from '@lobechat/electron-client-ipc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HeterogeneousAgentCtr from '../HeterogeneousAgentCtr';

const FAKE_DESKTOP_PATH = '/Users/fake/Desktop';

const { mockGetAllWindows } = vi.hoisted(() => ({
  mockGetAllWindows: vi.fn<() => any[]>(() => []),
}));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => mockGetAllWindows() },
  app: {
    getPath: vi.fn((name: string) => (name === 'desktop' ? FAKE_DESKTOP_PATH : `/fake/${name}`)),
    isPackaged: false,
    on: vi.fn(),
    quit: vi.fn(),
  },
  ipcMain: { handle: vi.fn() },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Captures the most recent spawn() call so sendPrompt tests can assert on argv.
const spawnCalls: Array<{ args: string[]; command: string; options: any }> = [];
let nextFakeProc: any = null;
const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  return {
    ...actual,
    execFile: execFileMock,
    spawn: (command: string, args: string[], options: any) => {
      spawnCalls.push({ args, command, options });
      nextFakeProc?.__start?.();
      return nextFakeProc;
    },
  };
});

// LOBE-8745 swapped Claude Code's transport from `spawn()` to the
// `@anthropic-ai/claude-agent-sdk`. Mock the SDK's `query()` so claude-code
// sendPrompt tests can observe what the driver hands the SDK (cwd, extraArgs,
// canUseTool, user-message content, etc.) and feed parsed SDK messages back
// through the pipeline without spawning a real CLI.
const { detectCliMock, queryMock, sdkQueryCalls, sdkState } = vi.hoisted(() => {
  type QueryCall = {
    collectedUserMessages: any[];
    options: any;
    prompt: any;
  };
  const sdkQueryCalls: QueryCall[] = [];
  const sdkState = {
    closeSpy: vi.fn(),
    interruptSpy: vi.fn(async () => undefined),
    nextError: undefined as unknown,
    nextMessages: [] as any[],
  };

  const queryMock = vi.fn(({ options, prompt }: any) => {
    const call: QueryCall = { collectedUserMessages: [], options, prompt };
    sdkQueryCalls.push(call);
    const messagesForCall = [...sdkState.nextMessages];
    sdkState.nextMessages = [];
    const errorForCall = sdkState.nextError;
    sdkState.nextError = undefined;

    const q: any = {
      async *[Symbol.asyncIterator]() {
        if (prompt && typeof prompt[Symbol.asyncIterator] === 'function') {
          for await (const msg of prompt) call.collectedUserMessages.push(msg);
        }
        if (errorForCall) throw errorForCall;
        for (const m of messagesForCall) yield m;
      },
      close: sdkState.closeSpy,
      interrupt: sdkState.interruptSpy,
    };
    return q;
  });

  // Default to "claude available at /usr/bin/claude" so the SDK path doesn't
  // throw `CliNotFound` before tests can observe the query call. Individual
  // tests opt into the unavailable path via `mockResolvedValueOnce`. Typed as
  // a loose status object so `{ available: false }` overrides don't trip
  // path/version inference from the default value.
  type DetectorStatus = {
    available: boolean;
    error?: string;
    path?: string;
    version?: string;
  };
  const detectCliMock = vi.fn<(...args: any[]) => Promise<DetectorStatus>>(async () => ({
    available: true,
    path: '/usr/bin/claude',
    version: 'claude 1.0.0 (Claude Code)',
  }));

  return { detectCliMock, queryMock, sdkQueryCalls, sdkState };
});

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: queryMock,
}));

vi.mock('@/modules/toolDetectors', () => ({
  detectHeterogeneousCliCommand: detectCliMock,
}));

/**
 * Build a fake ChildProcess that immediately exits cleanly. Records every
 * stdin write on the returned `writes` array so tests can inspect the payload.
 */
const createFakeProc = ({
  exitCode = 0,
  stderrLines = [],
  stdoutLines = [],
}: {
  exitCode?: number;
  stderrLines?: string[];
  stdoutLines?: string[];
} = {}) => {
  const proc = new EventEmitter() as any;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const writes: string[] = [];
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.stdin = {
    end: vi.fn(),
    write: vi.fn((chunk: string, cb?: () => void) => {
      writes.push(chunk);
      cb?.();
      return true;
    }),
  };
  proc.kill = vi.fn();
  proc.killed = false;
  let started = false;
  proc.__start = () => {
    if (started) return;
    started = true;
    // Exit asynchronously so the Promise returned by sendPrompt resolves cleanly.
    setImmediate(() => {
      for (const line of stdoutLines) {
        stdout.write(line);
      }
      for (const line of stderrLines) {
        stderr.write(line);
      }
      stdout.end();
      stderr.end();
      proc.emit('exit', exitCode);
    });
  };
  return { proc, writes };
};

const getFlagValues = (args: string[], flag: string) =>
  args.flatMap((arg, index) => (arg === flag ? [args[index + 1]] : []));

describe('HeterogeneousAgentCtr', () => {
  let appStoragePath: string;

  beforeEach(async () => {
    appStoragePath = await mkdtemp(path.join(tmpdir(), 'lobehub-hetero-'));
  });

  afterEach(async () => {
    await rm(appStoragePath, { force: true, recursive: true });
  });

  describe('image cache (delegates to shared `normalizeImage`)', () => {
    // Image fetch + cache moved to `@lobechat/heterogeneous-agents/spawn`'s
    // `normalizeImage`. The desktop controller passes its own cacheDir so the
    // path-traversal invariant — id segments like `../../foo` MUST be hashed,
    // never used as path segments — is enforced by the shared helper. Verify
    // that invariant against the same cacheDir the controller would use.
    const fixtureCacheDir = (storage: string) => path.join(storage, 'heteroAgent/files');
    const importNormalize = async () => {
      const { mkdir } = await import('node:fs/promises');
      const mod = await import('@lobechat/heterogeneous-agents/spawn');
      return { mkdir, normalizeImage: mod.normalizeImage };
    };

    it('stores traversal-looking ids inside the cache root via a stable hash key', async () => {
      const { mkdir, normalizeImage } = await importNormalize();
      const cacheDir = fixtureCacheDir(appStoragePath);
      await mkdir(cacheDir, { recursive: true });

      const escapedTargetName = `${path.basename(appStoragePath)}-outside-storage`;
      const escapePath = path.join(cacheDir, `../../../${escapedTargetName}`);

      try {
        await unlink(escapePath);
      } catch {
        // best-effort cleanup
      }

      await normalizeImage(
        {
          id: `../../../${escapedTargetName}`,
          type: 'url',
          url: 'data:text/plain;base64,T1VUU0lERQ==',
        },
        { cacheDir, fetcher: (async () => new Response('OUTSIDE', { status: 200 })) as any },
      );

      const cacheEntries = await readdir(cacheDir);

      expect(cacheEntries).toHaveLength(2);
      expect(cacheEntries.every((entry) => /^[a-f0-9]{64}(?:\.meta)?$/.test(entry))).toBe(true);
      await expect(access(escapePath)).rejects.toThrow();

      try {
        await unlink(escapePath);
      } catch {
        // best-effort cleanup
      }
    });

    it('does not trust pre-seeded out-of-root traversal cache files as cache hits', async () => {
      const { mkdir, normalizeImage } = await importNormalize();
      const cacheDir = fixtureCacheDir(appStoragePath);
      await mkdir(cacheDir, { recursive: true });

      const traversalId = '../../preexisting-secret';
      const outOfRootDataPath = path.join(cacheDir, traversalId);
      const outOfRootMetaPath = path.join(cacheDir, `${traversalId}.meta`);

      await writeFile(outOfRootDataPath, 'SECRET');
      await writeFile(
        outOfRootMetaPath,
        JSON.stringify({ id: traversalId, mimeType: 'text/plain' }),
      );

      const result = await normalizeImage(
        { id: traversalId, type: 'url', url: 'data:text/plain;base64,SUdOT1JFRA==' },
        {
          cacheDir,
          fetcher: (async () =>
            new Response('IGNORED', {
              headers: { 'content-type': 'text/plain' },
              status: 200,
            })) as any,
        },
      );

      expect(Buffer.from(result.buffer).toString('utf8')).toBe('IGNORED');
      expect(result.mediaType).toBe('text/plain');
      await expect(readFile(outOfRootDataPath, 'utf8')).resolves.toBe('SECRET');
    });
  });

  describe('sendPrompt (claude-code) — SDK transport (LOBE-8745)', () => {
    // Claude Code now flows through `@anthropic-ai/claude-agent-sdk`'s
    // `query()` instead of `spawn()`. The mock at the top of the file captures
    // each call so we can assert on what the controller hands the SDK without
    // a real CLI. Codex still uses the spawn path and is tested separately.
    beforeEach(() => {
      spawnCalls.length = 0;
      execFileMock.mockReset();
      sdkQueryCalls.length = 0;
      sdkState.nextMessages = [];
      sdkState.nextError = undefined;
      sdkState.closeSpy.mockClear();
      sdkState.interruptSpy.mockClear();
      queryMock.mockClear();
      detectCliMock.mockClear();
    });

    const runSendPrompt = async (
      prompt: string,
      sessionOverrides: Record<string, any> = {},
      sdkMessages: any[] = [],
      sendPromptOverrides: Partial<{ imageList: Array<{ id: string; url: string }> }> = {},
    ) => {
      sdkState.nextMessages = sdkMessages;

      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'claude-code',
        command: 'claude',
        ...sessionOverrides,
      });
      await ctr.sendPrompt({ operationId: 'op-test', prompt, sessionId, ...sendPromptOverrides });

      const call = sdkQueryCalls.at(-1)!;
      const userMessage = call.collectedUserMessages[0];
      const userContent = userMessage?.message?.content ?? [];
      return { call, ctr, sessionId, userContent };
    };

    it('passes prompt via SDK user message — never as a CLI positional arg', async () => {
      const prompt = '-- 这是破折号测试 --help';
      const { call, userContent } = await runSendPrompt(prompt);

      // The SDK takes the prompt as part of an `AsyncIterable<SDKUserMessage>`
      // payload; argv-style extras (`extraArgs`) is reserved for `--flag` pairs
      // and must never carry the prompt.
      const extraArgValues = Object.values(call.options.extraArgs ?? {});
      expect(extraArgValues).not.toContain(prompt);
      expect(userContent).toEqual([{ text: prompt, type: 'text' }]);
    });

    it.each([
      '-flag-looking-prompt',
      '--help please',
      '- dash at start',
      '-p -- mixed',
      'normal prompt with -dash- inside',
    ])('accepts dash-containing prompt without leaking to argv: %s', async (prompt) => {
      const { call, userContent } = await runSendPrompt(prompt);

      const extraArgValues = Object.values(call.options.extraArgs ?? {});
      expect(extraArgValues).not.toContain(prompt);
      expect(userContent[0]).toEqual({ text: prompt, type: 'text' });
    });

    it('falls back to the user Desktop when no cwd is supplied', async () => {
      const { call } = await runSendPrompt('hello');

      // When launched from Finder the Electron parent cwd is `/` — the
      // controller must override that with the user's Desktop so CC writes
      // land somewhere sensible.
      expect(call.options.cwd).toBe(FAKE_DESKTOP_PATH);
    });

    it('respects an explicit cwd passed to startSession', async () => {
      const explicitCwd = '/Users/fake/projects/my-repo';
      const { call } = await runSendPrompt('hello', { cwd: explicitCwd });

      expect(call.options.cwd).toBe(explicitCwd);
    });

    it('forwards the resolved CLI path so the SDK does not fall back to a bundled binary', async () => {
      const { call } = await runSendPrompt('hello');

      // `apps/desktop/.pnpmfile.cjs` strips the SDK's bundled platform binary
      // at install. Without an explicit path the SDK would ENOENT inside its
      // own resolver — the controller MUST pass `pathToClaudeCodeExecutable`.
      expect(call.options.pathToClaudeCodeExecutable).toBe('/usr/bin/claude');
    });

    it('omits the empty text block when only images are attached', async () => {
      const { userContent } = await runSendPrompt('', { cwd: appStoragePath }, [], {
        imageList: [{ id: 'image-1', url: 'data:image/png;base64,UE5HX1RFU1Q=' }],
      });

      // Anthropic rejects `{ text: '', type: 'text' }` with
      // "messages: text content blocks must be non-empty".
      expect(userContent).toEqual([
        {
          source: { data: 'UE5HX1RFU1Q=', media_type: 'image/png', type: 'base64' },
          type: 'image',
        },
      ]);
    });

    it('caches URL-fetched image attachments under appStoragePath, never inside the workspace cwd', async () => {
      // The prior implementation cached URL images under
      // `${cwd}/.heerogeneous-tracing`. That broke read-only workspaces and
      // littered user projects with a hidden cache folder. The controller now
      // pins the cache directory to its own storage (`appStoragePath/...`) —
      // matches what the legacy spawn path always did.
      const workspaceCwd = await mkdtemp(path.join(tmpdir(), 'lobehub-hetero-cwd-'));
      const fetcher = vi.fn(async (url: string) => {
        if (!url.startsWith('https://example.test/image.png')) {
          throw new Error(`Unexpected fetch URL: ${url}`);
        }
        return new Response(Buffer.from('REMOTE_IMAGE_BYTES'), {
          headers: { 'content-type': 'image/png' },
          status: 200,
        });
      });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetcher as unknown as typeof fetch;

      try {
        const { call } = await runSendPrompt('inspect this', { cwd: workspaceCwd }, [], {
          imageList: [{ id: 'image-1', url: 'https://example.test/image.png' }],
        });

        // The controller must hand the SDK driver an `appStoragePath`-rooted
        // cache directory, not the workspace cwd.
        const expectedCacheDir = path.join(appStoragePath, 'heteroAgent/files');
        expect(call.options.cwd).toBe(workspaceCwd);
        expect(fetcher).toHaveBeenCalledTimes(1);
        await expect(readdir(expectedCacheDir)).resolves.toEqual(
          expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}(?:\.meta)?$/)]),
        );
        // No hidden cache folder ever appears inside the workspace.
        await expect(access(path.join(workspaceCwd, '.heerogeneous-tracing'))).rejects.toThrow();
      } finally {
        globalThis.fetch = originalFetch;
        await rm(workspaceCwd, { force: true, recursive: true });
      }
    });

    it('captures the Claude Code session id from SDK init messages', async () => {
      const { ctr, sessionId } = await runSendPrompt('hello', {}, [
        { model: 'claude-3-5-sonnet', session_id: 'sess_cc_123', subtype: 'init', type: 'system' },
      ]);

      await expect(ctr.getSessionInfo({ sessionId })).resolves.toEqual({
        agentSessionId: 'sess_cc_123',
      });
    });

    it('fails the SDK preflight when the resolved CLI is unavailable', async () => {
      // `runSdkStream` re-runs CLI detection so the bundled-binary fallback is
      // never relied on. When detection reports unavailable, the controller
      // must broadcast a session error and reject before invoking `query()`.
      detectCliMock.mockResolvedValueOnce({ available: false });
      // Also override the preflight call (default-command path) so it doesn't
      // short-circuit via `toolDetectorManager` first.
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        toolDetectorManager: { detect: vi.fn().mockResolvedValue({ available: false }) },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'claude-code',
        command: 'claude',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId }),
      ).rejects.toThrow('Claude Code CLI was not found');
      expect(queryMock).not.toHaveBeenCalled();
    });
  });

  describe('sendPrompt (codex)', () => {
    beforeEach(() => {
      spawnCalls.length = 0;
      execFileMock.mockReset();
    });

    const runSendPrompt = async (
      prompt: string,
      sessionOverrides: Record<string, any> = {},
      stdoutLines: string[] = [],
      sendPromptOverrides: Partial<{ imageList: Array<{ id: string; url: string }> }> = {},
    ) => {
      const { proc, writes } = createFakeProc({ stdoutLines });
      nextFakeProc = proc;

      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
        ...sessionOverrides,
      });
      await ctr.sendPrompt({ operationId: 'op-test', prompt, sessionId, ...sendPromptOverrides });

      const { args: cliArgs, command, options } = spawnCalls[0];
      return { cliArgs, command, ctr, options, sessionId, writes };
    };

    it('fails fast when Codex CLI is unavailable instead of attempting spawn', async () => {
      const detect = vi.fn().mockResolvedValue({ available: false });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        toolDetectorManager: { detect },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId }),
      ).rejects.toThrow('Codex CLI was not found');

      expect(detect).toHaveBeenCalledWith('codex', true);
      expect(spawnCalls).toHaveLength(0);
    });

    it('fails fast when Claude Code CLI is unavailable instead of attempting spawn', async () => {
      const detect = vi.fn().mockResolvedValue({ available: false });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        toolDetectorManager: { detect },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'claude-code',
        command: 'claude',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId }),
      ).rejects.toThrow('Claude Code CLI was not found');

      expect(detect).toHaveBeenCalledWith('claude', true);
      expect(spawnCalls).toHaveLength(0);
    });

    it('fails fast when a customized Claude command is unavailable instead of checking the default detector', async () => {
      // Customized commands skip the shared `toolDetectorManager` and route
      // through `detectHeterogeneousCliCommand` directly so the SDK preflight
      // still rejects unknown binaries.
      detectCliMock.mockResolvedValueOnce({ available: false });

      const detect = vi.fn().mockResolvedValue({ available: true });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        toolDetectorManager: { detect },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'claude-code',
        command: 'claude-alt',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId }),
      ).rejects.toThrow('Claude Code CLI was not found');

      expect(detect).not.toHaveBeenCalled();
      expect(detectCliMock).toHaveBeenCalledWith('claude-code', 'claude-alt');
      expect(spawnCalls).toHaveLength(0);
    });

    it('passes prompt via stdin to codex exec instead of argv', async () => {
      const prompt = '--run a shell-like prompt safely';
      const { cliArgs, command, writes } = await runSendPrompt(prompt);

      expect(command).toBe('codex');
      expect(cliArgs).not.toContain(prompt);
      expect(cliArgs).toEqual(
        expect.arrayContaining(['exec', '--json', '--skip-git-repo-check', '--full-auto']),
      );
      expect(cliArgs).not.toContain('-');
      expect(writes).toEqual([prompt]);
    });

    it('materializes image attachments into local files and forwards them via --image', async () => {
      const imageList = [
        { id: 'image-1', url: 'data:image/png;base64,UE5HX1RFU1Q=' },
        { id: 'image-2', url: 'data:image/jpeg;base64,SlBFR19URVNU' },
      ];
      const { cliArgs, writes } = await runSendPrompt('describe these screenshots', {}, [], {
        imageList,
      });

      const imagePaths = getFlagValues(cliArgs, '--image');

      expect(cliArgs).not.toContain('describe these screenshots');
      expect(cliArgs).not.toContain('-');
      expect(cliArgs.filter((arg) => arg === '--image')).toHaveLength(2);
      expect(imagePaths).toHaveLength(2);
      expect(imagePaths).not.toContain('-');
      expect(cliArgs.at(-1)).toBe(imagePaths[1]);
      expect(imagePaths[0]).toMatch(/\.png$/);
      expect(imagePaths[1]).toMatch(/\.jpg$/);
      expect(
        imagePaths.every((filePath) =>
          filePath.startsWith(path.join(appStoragePath, 'heteroAgent/files')),
        ),
      ).toBe(true);
      await expect(
        Promise.all(imagePaths.map((filePath) => readFile(filePath, 'utf8'))),
      ).resolves.toEqual(['PNG_TEST', 'JPEG_TEST']);
      expect(writes).toEqual(['describe these screenshots']);
    });

    it('normalizes parameterized image MIME types before choosing the CLI file extension', async () => {
      const imageList = [
        { id: 'image-with-params', url: 'data:image/png;charset=utf-8;base64,UE5HX1RFU1Q=' },
      ];
      const { cliArgs } = await runSendPrompt('describe this screenshot', {}, [], { imageList });

      const imagePaths = getFlagValues(cliArgs, '--image');

      expect(imagePaths).toHaveLength(1);
      expect(imagePaths[0]).toMatch(/\.png$/);
      await expect(readFile(imagePaths[0], 'utf8')).resolves.toBe('PNG_TEST');
    });

    it('sniffs image bytes when MIME and URL do not expose a usable extension', async () => {
      const pngBytes = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('PNG_TEST'),
      ]);
      const imageList = [
        {
          id: 'image-octet',
          url: `data:application/octet-stream;base64,${pngBytes.toString('base64')}`,
        },
      ];
      const { cliArgs } = await runSendPrompt('describe this screenshot', {}, [], { imageList });

      const imagePaths = getFlagValues(cliArgs, '--image');

      expect(imagePaths).toHaveLength(1);
      expect(imagePaths[0]).toMatch(/\.png$/);
      await expect(readFile(imagePaths[0])).resolves.toEqual(pngBytes);
    });

    it('fails before spawning Codex when any image cannot be materialized', async () => {
      const imageList = [
        { id: 'good-image', url: 'data:image/png;base64,VkFMSURfSU1BR0U=' },
        { id: 'bad-image', url: 'bad://broken-image' },
      ];
      const { proc } = createFakeProc();
      nextFakeProc = proc;
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
      });

      await expect(
        ctr.sendPrompt({
          imageList,
          operationId: 'op-test',
          prompt: 'inspect the screenshots',
          sessionId,
        }),
      ).rejects.toThrow('Failed to attach image(s) to CLI');
      expect(spawnCalls).toHaveLength(0);
    });

    it('does not surface Codex stderr status and warn logs as the terminal error', async () => {
      const { proc } = createFakeProc({
        exitCode: 1,
        stderrLines: [
          'Reading prompt from stdin...\n',
          '2026-04-25T09:24:08.165782Z  WARN codex_core::session_startup_prewarm: startup websocket prewarm setup failed\n',
          '<html>\n',
          '  <body>challenge page</body>\n',
          '</html>\n',
        ],
        stdoutLines: [
          `${JSON.stringify({ thread_id: 'thread_codex_123', type: 'thread.started' })}\n`,
          `${JSON.stringify({ type: 'turn.started' })}\n`,
          `${JSON.stringify({ message: 'real Codex JSONL error', type: 'error' })}\n`,
        ],
      });
      nextFakeProc = proc;
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId }),
      ).rejects.toThrow('Agent exited with code 1');
    });

    it('uses codex exec resume syntax when continuing an existing thread', async () => {
      const { cliArgs } = await runSendPrompt('continue', { resumeSessionId: 'thread_abc' });

      expect(cliArgs.slice(0, 2)).toEqual(['exec', 'resume']);
      expect(cliArgs).toContain('thread_abc');
      expect(cliArgs).not.toContain('--resume');
      expect(cliArgs.at(-2)).toBe('thread_abc');
      expect(cliArgs.at(-1)).toBe('-');
    });

    it('writes raw CLI streams to a dev trace directory grouped by agent type', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        const prompt = 'trace this run';
        const rawLine = `${JSON.stringify({
          thread_id: 'thread_codex_trace',
          type: 'thread.started',
        })}\n`;
        const { sessionId } = await runSendPrompt(prompt, { cwd: appStoragePath }, [rawLine], {
          imageList: [{ id: 'image-1', url: 'data:image/png;base64,UE5HX1RFU1Q=' }],
        });
        const traceRoot = path.join(appStoragePath, '.heerogeneous-tracing');
        const agentTraceRoot = path.join(traceRoot, 'codex');
        const traceDirs = await readdir(agentTraceRoot);

        expect(traceDirs).toHaveLength(1);

        const traceDir = path.join(agentTraceRoot, traceDirs[0]);

        await expect(readFile(path.join(traceRoot, '.last-live-trace'), 'utf8')).resolves.toBe(
          `${traceDir}\n`,
        );
        await expect(readFile(path.join(traceDir, 'stdin.txt'), 'utf8')).resolves.toBe(prompt);
        await expect(readFile(path.join(traceDir, 'stdout.jsonl'), 'utf8')).resolves.toBe(rawLine);
        await expect(readFile(path.join(traceDir, 'stderr.log'), 'utf8')).resolves.toBe('');
        await expect(readFile(path.join(traceDir, 'exit.json'), 'utf8')).resolves.toContain(
          '"code": 0',
        );

        const meta = JSON.parse(await readFile(path.join(traceDir, 'meta.json'), 'utf8'));

        expect(meta).toMatchObject({
          agentType: 'codex',
          command: 'codex',
          cwd: appStoragePath,
          sessionId,
          stdinBytes: Buffer.byteLength(prompt),
          stdoutFile: 'stdout.jsonl',
        });
        expect(meta.args).not.toContain('-');
        expect(meta.attachments).toEqual([{ id: 'image-1', urlKind: 'data' }]);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('skips trace creation (and never auto-creates the cwd) when the cwd is missing', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const missingCwd = path.join(appStoragePath, 'does-not-exist');

      try {
        await runSendPrompt('trace this run', { cwd: missingCwd });

        await expect(access(missingCwd)).rejects.toThrow();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('captures the Codex thread id from json output for later resume', async () => {
      const { ctr, sessionId } = await runSendPrompt('hello', {}, [
        `${JSON.stringify({ thread_id: 'thread_codex_123', type: 'thread.started' })}\n`,
      ]);

      await expect(ctr.getSessionInfo({ sessionId })).resolves.toEqual({
        agentSessionId: 'thread_codex_123',
      });
    });

    it('classifies stale Codex resume stderr as a structured resume error', () => {
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      const payload = (ctr as any).getSessionErrorPayload(
        'No conversation found for thread thread_stale_123',
        {
          agentSessionId: 'thread_stale_123',
          agentType: 'codex',
          args: [],
          command: 'codex',
          cwd: '/Users/fake/projects/repo',
          resumeSessionId: 'thread_stale_123',
          sessionId: 'session-1',
        },
      );

      expect(payload).toEqual({
        agentType: 'codex',
        code: HeterogeneousAgentSessionErrorCode.ResumeThreadNotFound,
        command: 'codex',
        message: 'The saved Codex thread could not be found, so it can no longer be resumed.',
        resumeSessionId: 'thread_stale_123',
        stderr: 'No conversation found for thread thread_stale_123',
        workingDirectory: '/Users/fake/projects/repo',
      });
    });

    it('classifies CLI authentication failures as auth-required errors', () => {
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      const payload = (ctr as any).getSessionErrorPayload(
        'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"Invalid authentication credentials"}}',
        {
          agentType: 'claude-code',
          args: [],
          command: 'claude',
          sessionId: 'session-1',
        },
      );

      expect(payload).toEqual({
        agentType: 'claude-code',
        code: HeterogeneousAgentSessionErrorCode.AuthRequired,
        command: 'claude',
        docsUrl: 'https://docs.anthropic.com/en/docs/claude-code/setup',
        message:
          'Claude Code could not authenticate. Sign in again or refresh its credentials, then retry.',
        stderr:
          'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"Invalid authentication credentials"}}',
      });
    });
  });

  /**
   * Node may emit `proc.on('exit')` BEFORE stdout fully drains (documented in
   * child_process docs as "stdio streams might still be open"). The phase 0
   * refactor moved adapter ownership to main, so renderer no longer flushes
   * its own adapter on session-complete — meaning trailing events from
   * `pipeline.flush()` (e.g. Codex's synthesized `tool_end` for unfinished
   * tool calls) would race against — and lose to — the
   * `heteroAgentSessionComplete` broadcast without an explicit gate.
   *
   * The fix in `proc.on('exit')` is to await stdout `'end'/'close'` (so the
   * `stdout.on('end')` handler can schedule `pipeline.flush()` onto the
   * broadcast queue), then drain the queue, then broadcast complete.
   */
  describe('exit-before-end ordering (LOBE-8516 phase 0 race)', () => {
    let broadcasts: Array<{ channel: string; data: any }>;

    beforeEach(() => {
      spawnCalls.length = 0;
      execFileMock.mockReset();
      broadcasts = [];
      mockGetAllWindows.mockImplementation(() => [
        {
          isDestroyed: () => false,
          webContents: {
            send: (channel: string, data: any) => broadcasts.push({ channel, data }),
          },
        },
      ]);
    });

    afterEach(() => {
      mockGetAllWindows.mockReset();
      mockGetAllWindows.mockReturnValue([]);
    });

    it('delivers pipeline.flush() events BEFORE heteroAgentSessionComplete even when proc exit precedes stdout end', async () => {
      // Codex `item.started` for a tool — adapter buffers it as a pending
      // tool call. On flush, adapter synthesizes a trailing `tool_end`. This
      // is exactly the kind of event the race would lose against complete.
      const itemStarted = `${JSON.stringify({
        item: {
          aggregated_output: '',
          command: 'echo hi',
          id: 'cmd-1',
          status: 'in_progress',
          type: 'command_execution',
        },
        type: 'item.started',
      })}\n`;
      const threadStarted = `${JSON.stringify({ thread_id: 't1', type: 'thread.started' })}\n`;

      const proc = new EventEmitter() as any;
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      proc.stdout = stdout;
      proc.stderr = stderr;
      proc.stdin = {
        end: vi.fn(),
        write: vi.fn((_chunk: any, cb?: () => void) => {
          cb?.();
          return true;
        }),
      };
      proc.kill = vi.fn();
      proc.killed = false;
      proc.__start = () => {
        setImmediate(() => {
          stdout.write(threadStarted);
          stdout.write(itemStarted);
          stderr.end();
          // ⚠️ Reproduce the documented Node race: emit exit BEFORE stdout
          // ends. Without the streamFinished gate in the controller, the
          // broadcast queue settles immediately (no flush queued yet) and
          // complete fires before the trailing tool_end ever broadcasts.
          proc.emit('exit', 0);
          setImmediate(() => stdout.end());
        });
      };
      nextFakeProc = proc;

      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({ agentType: 'codex', command: 'codex' });
      await ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId });

      const events = broadcasts.filter((b) => b.channel === 'heteroAgentEvent');
      const completeIdx = broadcasts.findIndex((b) => b.channel === 'heteroAgentSessionComplete');
      const lastEventIdx = broadcasts.findLastIndex((b) => b.channel === 'heteroAgentEvent');

      expect(completeIdx).toBeGreaterThan(-1);
      expect(events.length).toBeGreaterThan(0);
      // Every stream event must land before complete — no trailing events
      // sneak in after the renderer has been told the session is done.
      expect(lastEventIdx).toBeLessThan(completeIdx);

      // Specifically: the synthesized tool_end for the pending command
      // execution (emitted only by adapter.flush()) is in the broadcast.
      const toolEnds = events.filter((b) => (b.data as any)?.event?.type === 'tool_end');
      expect(toolEnds.length).toBeGreaterThan(0);
    });
  });

  describe('app-quit cleanup of pending AskUserQuestion interventions (LOBE-8725 → LOBE-8746)', () => {
    // LOBE-8746 retired the MCP-bridge `lobe-cc-mcp-<opId>.json` files; pending
    // AskUserQuestion entries are now in-memory `canUseTool` resolvers on
    // `opIdToInterventions`. The `before-quit` handler still has to settle
    // them on app teardown (so the SDK callback returns a deny payload and the
    // renderer's intervention UI doesn't sit on `pending`), and SIGTERM/SIGINT
    // must defer to Electron's quit flow on external kills.

    /**
     * Seed a pending intervention slot on `opIdToInterventions` keyed by
     * `operationId` → `toolCallId`. Returns the captured `resolve` spy so the
     * caller can assert the cleanup settled it with `session_ended`.
     */
    const seedPendingIntervention = (
      ctr: HeterogeneousAgentCtr,
      opId: string,
      toolCallId = 'tool-1',
    ) => {
      const resolve = vi.fn();
      const slot = { identifier: 'claude-code', resolve };
      const opMap = new Map<string, any>([[toolCallId, slot]]);
      const interventions = (ctr as any).opIdToInterventions as Map<string, Map<string, any>>;
      interventions.set(opId, opMap);
      return { resolve, toolCallId };
    };

    const captureRegisteredHandler = (
      registerSpy: ReturnType<typeof vi.fn> | ReturnType<typeof vi.spyOn>,
      eventName: string,
    ): (() => void) => {
      const calls = (registerSpy as any).mock.calls as Array<[string, () => void]>;
      const match = calls.findLast(([evt]) => evt === eventName);
      if (!match) throw new Error(`no handler registered for "${eventName}"`);
      return match[1];
    };

    it('before-quit resolves every pending intervention with session_ended and clears the map', async () => {
      const electron = (await import('electron')) as any;
      electron.app.on.mockClear();

      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      const { resolve: resolveA, toolCallId: tcA } = seedPendingIntervention(ctr, 'opA');
      const { resolve: resolveB, toolCallId: tcB } = seedPendingIntervention(ctr, 'opB');

      ctr.afterAppReady();
      const beforeQuit = captureRegisteredHandler(electron.app.on, 'before-quit');
      beforeQuit();

      expect(resolveA).toHaveBeenCalledWith({
        cancelReason: 'session_ended',
        cancelled: true,
        toolCallId: tcA,
      });
      expect(resolveB).toHaveBeenCalledWith({
        cancelReason: 'session_ended',
        cancelled: true,
        toolCallId: tcB,
      });
      expect((ctr as any).opIdToInterventions.size).toBe(0);
    });

    it('SIGTERM handler defers to electronApp.quit so before-quit runs (external-kill path)', async () => {
      // External kills (test harness, OS shutdown) skip Electron's lifecycle
      // events entirely — `before-quit` never fires, so the controller hooks
      // the raw process signals and re-enters Electron's quit flow. Stub
      // `process.on` and `process.exit` so this test never leaks a real
      // signal listener or actually exits the test worker if the fail-safe
      // `setTimeout(..., 1000)` fires before mockRestore.
      const electron = (await import('electron')) as any;
      electron.app.on.mockClear();
      electron.app.quit.mockClear();
      const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      try {
        const ctr = new HeterogeneousAgentCtr({
          appStoragePath,
          storeManager: { get: vi.fn() },
        } as any);
        seedPendingIntervention(ctr, 'opSigterm');

        ctr.afterAppReady();
        const sigterm = captureRegisteredHandler(processOnSpy, 'SIGTERM');
        sigterm();

        expect(electron.app.quit).toHaveBeenCalled();
      } finally {
        processOnSpy.mockRestore();
        processExitSpy.mockRestore();
      }
    });

    it('SIGINT handler defers to electronApp.quit so before-quit runs (Ctrl-C path)', async () => {
      const electron = (await import('electron')) as any;
      electron.app.on.mockClear();
      electron.app.quit.mockClear();
      const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      try {
        const ctr = new HeterogeneousAgentCtr({
          appStoragePath,
          storeManager: { get: vi.fn() },
        } as any);
        seedPendingIntervention(ctr, 'opSigint');

        ctr.afterAppReady();
        const sigint = captureRegisteredHandler(processOnSpy, 'SIGINT');
        sigint();

        expect(electron.app.quit).toHaveBeenCalled();
      } finally {
        processOnSpy.mockRestore();
        processExitSpy.mockRestore();
      }
    });

    it('cleanup is idempotent — before-quit on an empty intervention map does not throw', async () => {
      const electron = (await import('electron')) as any;
      electron.app.on.mockClear();

      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { resolve } = seedPendingIntervention(ctr, 'opIdempotent');

      ctr.afterAppReady();
      const beforeQuit = captureRegisteredHandler(electron.app.on, 'before-quit');

      // First fire resolves the pending entry and clears the map.
      expect(() => beforeQuit()).not.toThrow();
      expect(resolve).toHaveBeenCalledTimes(1);

      // Second fire (e.g. a partial cleanup race where another path already
      // settled the map) must be a no-op rather than throwing on an empty map.
      expect(() => beforeQuit()).not.toThrow();
      expect(resolve).toHaveBeenCalledTimes(1);
    });
  });
});
