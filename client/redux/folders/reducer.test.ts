import { describe, expect, it } from 'vitest';
import type { Folder } from '@shared/types/library';
import reducer from './reducer';

const folders: Folder[] = [{ path: '/music', lastModified: 1 }];

describe('folders reducer', () => {
  it('starts empty', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual([]);
  });

  it('stores the received folders', () => {
    expect(reducer([], { type: 'STORE_FOLDERS', payload: { folders } })).toEqual(folders);
  });

  it('ignores unrelated and malformed actions', () => {
    expect(reducer(folders, { type: 'SET_VOLUME', payload: { volume: 1 } })).toBe(folders);
    expect(reducer(folders, 'nope' as never)).toBe(folders);
  });
});
