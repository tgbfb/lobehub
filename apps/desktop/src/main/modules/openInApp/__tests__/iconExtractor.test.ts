import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';

import { app } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractAllIcons, extractAppIcon } from '../iconExtractor';

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getFileIcon: vi.fn(),
  },
}));

const mockedAccess = vi.mocked(access);
const mockedExecFile = vi.mocked(execFile) as unknown as ReturnType<typeof vi.fn>;
const mockedGetFileIcon = vi.mocked(app.getFileIcon);

interface FakeImage {
  getSize: () => { height: number; width: number };
  isEmpty: () => boolean;
  resize: (opts: { height: number; quality: string; width: number }) => FakeImage;
  toDataURL: () => string;
}

const makeFakeImage = (dataUrl: string, opts: { empty?: boolean } = {}): FakeImage => {
  const img: FakeImage = {
    getSize: () => ({ height: 128, width: 128 }),
    isEmpty: () => Boolean(opts.empty),
    resize: () => img,
    toDataURL: () => dataUrl,
  };
  return img;
};

const respondExec = (outcome: { code: number; stderr?: string; stdout?: string }) => {
  mockedExecFile.mockImplementationOnce(
    (_file: string, _args: string[], _opts: unknown, cb: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (outcome.code === 0) {
        callback(null, outcome.stdout ?? '', outcome.stderr ?? '');
      } else {
        const err: NodeJS.ErrnoException = new Error('exec failed');
        callback(err, '', outcome.stderr ?? '');
      }
      return undefined as any;
    },
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractAppIcon', () => {
  describe('darwin', () => {
    it('returns data URL when bundle path exists', async () => {
      mockedAccess.mockResolvedValueOnce(undefined);
      mockedGetFileIcon.mockResolvedValueOnce(makeFakeImage('data:image/png;base64,MOCK') as any);

      const result = await extractAppIcon('vscode', 'darwin');

      expect(result).toBe('data:image/png;base64,MOCK');
      expect(mockedGetFileIcon).toHaveBeenCalledWith('/Applications/Visual Studio Code.app', {
        size: 'large',
      });
    });

    it('falls back to the next path when the first does not exist', async () => {
      // Terminal has two candidate paths; first fails, second succeeds.
      mockedAccess.mockRejectedValueOnce(new Error('missing'));
      mockedAccess.mockResolvedValueOnce(undefined);
      mockedGetFileIcon.mockResolvedValueOnce(makeFakeImage('data:image/png;base64,TERM') as any);

      const result = await extractAppIcon('terminal', 'darwin');

      expect(result).toBe('data:image/png;base64,TERM');
      expect(mockedGetFileIcon).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when no bundle path exists', async () => {
      mockedAccess.mockRejectedValue(new Error('missing'));

      const result = await extractAppIcon('vscode', 'darwin');

      expect(result).toBeUndefined();
      expect(mockedGetFileIcon).not.toHaveBeenCalled();
    });

    it('returns undefined when getFileIcon throws', async () => {
      mockedAccess.mockResolvedValueOnce(undefined);
      mockedGetFileIcon.mockRejectedValueOnce(new Error('icon read failed'));

      const result = await extractAppIcon('vscode', 'darwin');

      expect(result).toBeUndefined();
    });

    it('returns undefined when icon image is empty', async () => {
      mockedAccess.mockResolvedValueOnce(undefined);
      mockedGetFileIcon.mockResolvedValueOnce(
        makeFakeImage('data:image/png;base64,', { empty: true }) as any,
      );

      const result = await extractAppIcon('vscode', 'darwin');

      expect(result).toBeUndefined();
    });

    it('returns undefined when registry has no darwin entry for the app', async () => {
      const result = await extractAppIcon('explorer', 'darwin');
      expect(result).toBeUndefined();
      expect(mockedAccess).not.toHaveBeenCalled();
    });
  });

  describe('win32', () => {
    it('resolves exe path via where and returns data URL', async () => {
      respondExec({ code: 0, stdout: 'C:\\Program Files\\Microsoft VS Code\\Code.exe\r\n' });
      mockedGetFileIcon.mockResolvedValueOnce(makeFakeImage('data:image/png;base64,WIN') as any);

      const result = await extractAppIcon('vscode', 'win32');

      expect(result).toBe('data:image/png;base64,WIN');
      expect(mockedGetFileIcon).toHaveBeenCalledWith(
        'C:\\Program Files\\Microsoft VS Code\\Code.exe',
        { size: 'large' },
      );
    });

    it('uses only the first line when where returns multiple paths', async () => {
      respondExec({
        code: 0,
        stdout: 'C:\\path\\one\\Code.exe\r\nC:\\path\\two\\Code.exe\r\n',
      });
      mockedGetFileIcon.mockResolvedValueOnce(makeFakeImage('data:image/png;base64,WIN1') as any);

      await extractAppIcon('vscode', 'win32');

      expect(mockedGetFileIcon).toHaveBeenCalledWith('C:\\path\\one\\Code.exe', {
        size: 'large',
      });
    });

    it('returns undefined when where fails', async () => {
      respondExec({ code: 1, stderr: 'INFO: not found' });

      const result = await extractAppIcon('vscode', 'win32');

      expect(result).toBeUndefined();
      expect(mockedGetFileIcon).not.toHaveBeenCalled();
    });

    it('returns undefined when registry has no win32 registryAppPaths entry', async () => {
      const result = await extractAppIcon('finder', 'win32');
      expect(result).toBeUndefined();
      expect(mockedExecFile).not.toHaveBeenCalled();
    });
  });

  describe('linux', () => {
    it('returns undefined unconditionally', async () => {
      const result = await extractAppIcon('vscode', 'linux');
      expect(result).toBeUndefined();
      expect(mockedAccess).not.toHaveBeenCalled();
      expect(mockedExecFile).not.toHaveBeenCalled();
      expect(mockedGetFileIcon).not.toHaveBeenCalled();
    });
  });
});

describe('extractAllIcons', () => {
  it('returns a map of only AppIds with successfully extracted icons', async () => {
    // vscode succeeds, cursor's path missing, xcode succeeds
    mockedAccess.mockImplementation(async (p: any) => {
      if (typeof p === 'string' && p.includes('Cursor.app')) throw new Error('missing');
      return undefined;
    });
    mockedGetFileIcon.mockImplementation(
      async (filePath: string) => makeFakeImage(`data:image/png;base64,${filePath}`) as any,
    );

    const map = await extractAllIcons(['vscode', 'cursor', 'xcode'], 'darwin');

    expect(map.has('vscode')).toBe(true);
    expect(map.has('xcode')).toBe(true);
    expect(map.has('cursor')).toBe(false);
  });

  it('returns empty map when input list is empty', async () => {
    const map = await extractAllIcons([], 'darwin');
    expect(map.size).toBe(0);
  });

  it('does not throw when extraction errors', async () => {
    mockedAccess.mockResolvedValue(undefined);
    mockedGetFileIcon.mockRejectedValue(new Error('boom'));

    const map = await extractAllIcons(['vscode'], 'darwin');

    expect(map.size).toBe(0);
  });
});
