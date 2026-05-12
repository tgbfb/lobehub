import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { promisify } from 'node:util';

import type { DetectedApp, OpenInAppId } from '@lobechat/electron-client-ipc';

import { createLogger } from '@/utils/logger';

import { extractAllIcons } from './iconExtractor';
import type { DetectStrategy } from './registry';
import { ALWAYS_INSTALLED, APP_REGISTRY } from './registry';

// Set `LOBE_OPEN_IN_APP_ENABLE_ICONS=1` to opt back into real icon extraction
// via `app.getFileIcon`. Disabled by default because Electron 41 + macOS 26
// crashes the entire process (EXC_BREAKPOINT inside [NSWorkspace
// iconForContentType:] / [NSImage recache]) the moment getFileIcon resolves
// a non-trivial .app bundle. Renderer falls back to lucide icons when the
// `icon` field is absent — distinct per app category and stable.
const ICON_EXTRACTION_ENABLED = process.env.LOBE_OPEN_IN_APP_ENABLE_ICONS === '1';

const logger = createLogger('modules:openInApp:detectors');

const execFileAsync = promisify(execFile);

const SAFE_BINARY_REGEX = /^[\w.-]+$/;

const probeAppBundle = async (paths: string[]): Promise<boolean> => {
  for (const path of paths) {
    try {
      await access(path);
      return true;
    } catch {
      // try next
    }
  }
  return false;
};

const probeCommandV = async (binary: string): Promise<boolean> => {
  if (!SAFE_BINARY_REGEX.test(binary)) {
    logger.debug(`rejecting unsafe binary name for commandV: ${binary}`);
    return false;
  }
  try {
    await execFileAsync('/bin/sh', ['-c', `command -v "${binary}"`]);
    return true;
  } catch (error) {
    logger.debug(`commandV probe failed for ${binary}: ${(error as Error).message}`);
    return false;
  }
};

const probeRegistryAppPaths = async (exeName: string): Promise<boolean> => {
  try {
    await execFileAsync('where', [exeName], { windowsHide: true });
    return true;
  } catch (error) {
    logger.debug(`where probe failed for ${exeName}: ${(error as Error).message}`);
    return false;
  }
};

const runDetectStrategy = (strategy: DetectStrategy): Promise<boolean> => {
  switch (strategy.type) {
    case 'appBundle': {
      return probeAppBundle(strategy.paths);
    }
    case 'commandV': {
      return probeCommandV(strategy.binary);
    }
    case 'registryAppPaths': {
      return probeRegistryAppPaths(strategy.exeName);
    }
  }
};

export const detectApp = async (id: OpenInAppId, platform: NodeJS.Platform): Promise<boolean> => {
  if (ALWAYS_INSTALLED[platform] === id) {
    return true;
  }
  const descriptor = APP_REGISTRY[id];
  const strategy = descriptor?.detect[platform];
  if (!strategy) {
    return false;
  }
  return runDetectStrategy(strategy);
};

export const detectAllApps = async (
  platform: NodeJS.Platform = process.platform,
): Promise<DetectedApp[]> => {
  const entries = Object.entries(APP_REGISTRY) as Array<
    [OpenInAppId, (typeof APP_REGISTRY)[OpenInAppId]]
  >;
  const installedFlags = await Promise.all(entries.map(([id]) => detectApp(id, platform)));

  // Icon extraction is gated behind an env flag because it crashes Electron on
  // macOS 26 (see ICON_EXTRACTION_ENABLED comment above).
  const installedIds = ICON_EXTRACTION_ENABLED
    ? entries.filter((_entry, i) => installedFlags[i]).map(([id]) => id)
    : [];
  const icons = ICON_EXTRACTION_ENABLED
    ? await extractAllIcons(installedIds, platform)
    : new Map<OpenInAppId, string>();

  return entries.map(([id, descriptor], i) => {
    const installed = installedFlags[i];
    const icon = installed ? icons.get(id) : undefined;
    return {
      displayName: descriptor.displayName,
      id,
      installed,
      ...(icon ? { icon } : {}),
    } satisfies DetectedApp;
  });
};
