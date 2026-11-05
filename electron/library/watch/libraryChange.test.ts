import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { toChanges, withoutCovered } from './libraryChange';

describe('libraryChange', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-change-'));
    fs.mkdirSync(path.join(root, 'album'));
    fs.writeFileSync(path.join(root, 'album', 'one.flac'), '');
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  describe('toChanges', () => {
    it('scans a folder with what is below it, as a whole album can be moved in', async () => {
      expect(await toChanges(path.join(root, 'album'))).toEqual([{ path: path.join(root, 'album'), deep: true }]);
    });

    it('scans the folder of a file, and nothing below it', async () => {
      expect(await toChanges(path.join(root, 'album', 'one.flac'))).toEqual([{ path: path.join(root, 'album'), deep: false }]);
    });

    it('looks at what was below a path that is gone, and at the folder it was in', async () => {
      const gone = path.join(root, 'album', 'two.flac');

      expect(await toChanges(gone)).toEqual([
        { path: gone, deep: true },
        { path: path.join(root, 'album'), deep: false },
      ]);
    });
  });

  describe('withoutCovered', () => {
    const at = (...segments: string[]) => path.join(path.sep, 'music', ...segments);

    it('drops what a deep change covers, and what is the same', () => {
      expect(
        withoutCovered([
          { path: at('rock'), deep: false },
          { path: at('rock', 'live'), deep: true },
          { path: at('rock'), deep: true },
          { path: at('rock'), deep: true },
          { path: at('rocket'), deep: false },
        ])
      ).toEqual([
        { path: at('rock'), deep: true },
        { path: at('rocket'), deep: false },
      ]);
    });

    it('keeps the folders next to each other, and a shallow change does not cover the folders below it', () => {
      const changes = [
        { path: at('a'), deep: false },
        { path: at('a', 'b'), deep: false },
        { path: at('c'), deep: false },
      ];

      expect(withoutCovered(changes)).toEqual(changes);
    });
  });
});
