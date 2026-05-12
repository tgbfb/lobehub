import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { promisify } from 'node:util';

import type { OpenInAppId } from '@lobechat/electron-client-ipc';
import { app } from 'electron';

import { createLogger } from '@/utils/logger';

import { APP_REGISTRY } from './registry';

const logger = createLogger('modules:openInApp:iconExtractor');

const execFileAsync = promisify(execFile);

/** Source request size from getFileIcon. macOS returns the canonical 128×128
 *  bundle icon at `large`; `normal` (32×32) often degrades to the generic
 *  application placeholder when the high-res rendition cannot be loaded. */
const SOURCE_SIZE = 'large' as const;
/** Output px — we downscale once on the main side so the IPC payload stays
 *  small while still looking crisp at the renderer's 16-20px display size. */
const ICON_SIZE = 64;

const resolveDarwinBundlePath = async (id: OpenInAppId): Promise<string | undefined> => {
  const strategy = APP_REGISTRY[id]?.detect.darwin;
  if (!strategy || strategy.type !== 'appBundle') return undefined;
  for (const path of strategy.paths) {
    try {
      await access(path);
      return path;
    } catch {
      // try next
    }
  }
  return undefined;
};

const resolveWin32ExePath = async (id: OpenInAppId): Promise<string | undefined> => {
  const strategy = APP_REGISTRY[id]?.detect.win32;
  if (!strategy || strategy.type !== 'registryAppPaths') return undefined;
  try {
    const result = await execFileAsync('where', [strategy.exeName], { windowsHide: true });
    // `promisify(execFile)` may resolve to `{ stdout, stderr }` (when the
    // native `[util.promisify.custom]` symbol is present) or to `stdout`
    // alone (when it is not — e.g. under a mocked module in tests).
    const stdout =
      typeof result === 'string' ? result : ((result as { stdout?: string })?.stdout ?? '');
    const firstLine = stdout.split(/\r?\n/).find((line) => line.trim().length > 0);
    return firstLine?.trim();
  } catch (error) {
    logger.debug(`where probe failed for ${strategy.exeName}: ${(error as Error).message}`);
    return undefined;
  }
};

const extractFromPath = async (filePath: string): Promise<string | undefined> => {
  try {
    const icon = await app.getFileIcon(filePath, { size: SOURCE_SIZE });
    if (icon.isEmpty()) {
      logger.debug(`getFileIcon returned empty image for ${filePath}`);
      return undefined;
    }
    const sourceSize = icon.getSize();
    const resized = icon.resize({ height: ICON_SIZE, quality: 'better', width: ICON_SIZE });
    const dataUrl = resized.toDataURL();
    logger.debug(
      `extracted icon for ${filePath} (source ${sourceSize.width}x${sourceSize.height}, ` +
        `payload ${Math.round(dataUrl.length / 1024)}KB)`,
    );
    return dataUrl;
  } catch (error) {
    logger.debug(`getFileIcon failed for ${filePath}: ${(error as Error).message}`);
    return undefined;
  }
};

/**
 * Extract the real app icon for the given AppId on the current platform,
 * returning a base64 PNG data URL. Returns undefined when extraction is not
 * supported or fails (renderer then falls back to a lucide-react icon).
 *
 * Strategy:
 *  - macOS: locate the .app bundle path from the registry's `appBundle.paths`
 *    entry, take the first one that exists, call `app.getFileIcon(...)`.
 *  - Windows: resolve the .exe path via `where.exe <exeName>` (cheap; we
 *    already use `where` for detection), call `app.getFileIcon(exePath)`.
 *  - Linux: not implemented (icon themes vary widely) — returns undefined.
 *
 * Result is resized to ICON_SIZE x ICON_SIZE. Never throws; failures resolve
 * to undefined so detection is unaffected.
 */
export const extractAppIcon = async (
  id: OpenInAppId,
  platform: NodeJS.Platform = process.platform,
): Promise<string | undefined> => {
  try {
    if (platform === 'darwin') {
      const bundlePath = await resolveDarwinBundlePath(id);
      if (!bundlePath) return undefined;
      return await extractFromPath(bundlePath);
    }
    if (platform === 'win32') {
      const exePath = await resolveWin32ExePath(id);
      if (!exePath) return undefined;
      return await extractFromPath(exePath);
    }
    return undefined;
  } catch (error) {
    logger.debug(`extractAppIcon error for ${id}: ${(error as Error).message}`);
    return undefined;
  }
};

/**
 * Resolve icons in parallel for a list of installed AppIds. Apps with no
 * extractable icon are simply absent from the returned map.
 */
export const extractAllIcons = async (
  installedIds: OpenInAppId[],
  platform: NodeJS.Platform = process.platform,
): Promise<Map<OpenInAppId, string>> => {
  const results = await Promise.all(
    installedIds.map(async (id) => [id, await extractAppIcon(id, platform)] as const),
  );
  const map = new Map<OpenInAppId, string>();
  for (const [id, icon] of results) {
    if (icon) map.set(id, icon);
  }
  return map;
};
