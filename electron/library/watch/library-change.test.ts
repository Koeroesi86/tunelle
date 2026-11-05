import { describe, expect, it } from 'vitest';
import path from 'path';
import { withoutCovered } from './library-change';

describe('libraryChange', () => {
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
