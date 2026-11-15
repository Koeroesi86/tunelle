import path from 'path';

interface IndexedPath {
  path: string;
  folded: string;
}

export interface LibraryIndex {
  exact: Map<string, string>;
  folded: Map<string, IndexedPath[]>;
  byName: Map<string, IndexedPath[]>;
}

/** The text of a path as two systems can spell it differently: composed, and without the case */
const fold = (value: string) => value.normalize('NFC').toLowerCase();

const addTo = (map: Map<string, IndexedPath[]>, key: string, item: IndexedPath) => map.set(key, [...(map.get(key) ?? []), item]);

/** The paths of the library to look files up in, with the spellings that tell the paths of two systems apart */
export const createLibraryIndex = (libraryPaths: string[]): LibraryIndex => {
  const index: LibraryIndex = { exact: new Map(), folded: new Map(), byName: new Map() };

  libraryPaths.forEach((libraryPath) => {
    const item = { path: libraryPath, folded: fold(libraryPath) };
    index.exact.set(libraryPath.normalize('NFC'), libraryPath);
    addTo(index.folded, item.folded, item);
    addTo(index.byName, path.posix.basename(item.folded), item);
  });

  return index;
};

/** The most specific file that can only be the one: the tail of the path shared with the most of the candidates narrows them while any file shares it */
const narrowBySuffix = (candidates: IndexedPath[], segments: string[], length = 2): string | undefined => {
  const narrowed = length > segments.length ? [] : candidates.filter((candidate) => candidate.folded.endsWith(`/${segments.slice(-length).join('/')}`));
  if (narrowed.length > 0) return narrowBySuffix(narrowed, segments, length + 1);
  return candidates.length === 1 ? candidates[0]?.path : undefined;
};

/** The library path of a file of a playlist: the same path, else the same one in another case or composition when only one is, else the one file whose name and the tail of its path are the same as the longest tail that any file shares. See docs/app/playlist-import.md */
export const findInLibrary = (index: LibraryIndex, filePath: string) => {
  const exact = index.exact.get(filePath.normalize('NFC'));
  if (exact) return exact;

  const key = fold(filePath);
  const same = index.folded.get(key) ?? [];
  if (same.length === 1) return same[0]?.path;
  if (same.length > 1) return undefined;

  return narrowBySuffix(index.byName.get(path.posix.basename(key)) ?? [], key.split('/'));
};
