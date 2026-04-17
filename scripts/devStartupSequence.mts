import { type ChildProcess, spawn } from 'node:child_process';
import dotenv from 'dotenv';
import net from 'node:net';

dotenv.config();

const NEXT_HOST = 'localhost';
const DEFAULT_VITE_PORT = 9876;
const VITE_DEV_PORT_ENV = 'SPA_DEV_PORT';

/**
 * Resolve the Next.js dev port.
 * Priority: -p CLI flag > PORT env var > 3010.
 */
const resolveNextPort = (): number => {
  const pIndex = process.argv.indexOf('-p');
  if (pIndex !== -1 && process.argv[pIndex + 1]) {
    return Number(process.argv[pIndex + 1]);
  }
  if (process.env.PORT) return Number(process.env.PORT);
  return 3010;
};

const NEXT_PORT = resolveNextPort();
const NEXT_ROOT_URL = `http://${NEXT_HOST}:${NEXT_PORT}/`;
const NEXT_READY_TIMEOUT_MS = 180_000;
const NEXT_READY_RETRY_MS = 400;

let nextProcess: ChildProcess | undefined;
let viteProcess: ChildProcess | undefined;
let shuttingDown = false;

const isValidPort = (port: number) => Number.isInteger(port) && port > 0 && port <= 65_535;

const resolveConfiguredVitePort = () => {
  const port = Number(process.env[VITE_DEV_PORT_ENV]);

  return isValidPort(port) ? port : undefined;
};

interface ReservedPort {
  port: number;
  release: () => Promise<void>;
}

const reservePort = () =>
  new Promise<ReservedPort>((resolve, reject) => {
    const server = net.createServer();

    server.unref();
    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        reject(new Error('Failed to resolve reserved Vite port.'));
        return;
      }

      resolve({
        port: address.port,
        release: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((error) => {
              if (error) {
                rejectClose(error);
                return;
              }

              resolveClose();
            });
          }),
      });
    });
  });

const runNextDevServer = (env: NodeJS.ProcessEnv) =>
  spawn('npx', ['next', 'dev', '-p', String(NEXT_PORT)], {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

const runViteDevServer = (env: NodeJS.ProcessEnv, vitePort: number) =>
  spawn('npx', ['vite', '--port', String(vitePort), '--strictPort'], {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isPortOpen = (host: string, port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    const onDone = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once('connect', () => onDone(true));
    socket.once('error', () => onDone(false));
    socket.setTimeout(1_000, () => onDone(false));
  });

const waitForNextReady = async () => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < NEXT_READY_TIMEOUT_MS) {
    if (await isPortOpen(NEXT_HOST, NEXT_PORT)) return;
    await wait(NEXT_READY_RETRY_MS);
  }

  throw new Error(
    `Next server was not ready within ${NEXT_READY_TIMEOUT_MS / 1000}s on ${NEXT_HOST}:${NEXT_PORT}`,
  );
};

const prewarmNextRootCompile = async () => {
  const response = await fetch(NEXT_ROOT_URL, { signal: AbortSignal.timeout(120_000) });
  console.log(`✅ Next prewarm request finished (${response.status}) ${NEXT_ROOT_URL}`);
};

const runNextBackgroundTasks = () => {
  setTimeout(() => {
    console.log(`🔁 Next server URL: ${NEXT_ROOT_URL}`);
  }, 2_000);

  void (async () => {
    try {
      await waitForNextReady();
      await prewarmNextRootCompile();
    } catch (error) {
      console.warn('⚠️ Next prewarm skipped:', error);
    }
  })();
};

const terminateChild = (child?: ChildProcess) => {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
};

const shutdownAll = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;

  terminateChild(viteProcess);
  terminateChild(nextProcess);

  process.exitCode = signal === 'SIGINT' ? 130 : 143;
};

const watchChildExit = (child: ChildProcess, name: 'next' | 'vite') => {
  child.once('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(
        `❌ ${name} exited unexpectedly (code: ${code ?? 'null'}, signal: ${signal ?? 'null'})`,
      );
      shutdownAll('SIGTERM');
    }
  });
};

const main = async () => {
  process.once('SIGINT', () => shutdownAll('SIGINT'));
  process.once('SIGTERM', () => shutdownAll('SIGTERM'));

  const configuredVitePort = resolveConfiguredVitePort();
  const reservedVitePort = configuredVitePort === undefined ? await reservePort() : undefined;
  const vitePort = configuredVitePort ?? reservedVitePort?.port ?? DEFAULT_VITE_PORT;
  const childEnv = { ...process.env, [VITE_DEV_PORT_ENV]: String(vitePort) };

  process.env[VITE_DEV_PORT_ENV] = String(vitePort);

  nextProcess = runNextDevServer(childEnv);
  watchChildExit(nextProcess, 'next');

  if (reservedVitePort) {
    await reservedVitePort.release();
  }

  viteProcess = runViteDevServer(childEnv, vitePort);
  watchChildExit(viteProcess, 'vite');
  runNextBackgroundTasks();

  await Promise.race([
    new Promise((resolve) => nextProcess?.once('exit', resolve)),
    new Promise((resolve) => viteProcess?.once('exit', resolve)),
  ]);
};

void main().catch((error) => {
  console.error('❌ dev startup sequence failed:', error);
  shutdownAll('SIGTERM');
});
