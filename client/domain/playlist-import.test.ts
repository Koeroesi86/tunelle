import { describe, expect, it } from 'vitest';
import type { PlaylistImportReport } from '@shared/types/playlists';
import { describePlaylistImport } from './playlist-import';

const t = (key: string, values?: Record<string, string | number>) => `${key}${values ? JSON.stringify(values) : ''}`;

const report = (overrides: Partial<PlaylistImportReport>): PlaylistImportReport => ({
  fileName: '/m/a.m3u',
  name: 'Mix',
  status: 'created',
  imported: 3,
  unmatched: [],
  streams: 0,
  ...overrides,
});

describe('describePlaylistImport', () => {
  it('tells a playlist that is up to date in one line', () => {
    expect(describePlaylistImport(t as never, [report({ status: 'unchanged' })])).toBe('playlists.importUnchanged{"name":"Mix"}');
  });

  it('names the entries that are not in the library, the first ones and how many more', () => {
    const unmatched = Array.from({ length: 7 }, (_, index) => ({ location: `gone${index}.flac`, title: index === 0 ? 'First' : undefined }));
    const lines = describePlaylistImport(t as never, [report({ unmatched, streams: 2 })]).split('\n');

    expect(lines[0]).toContain('playlists.importCreated');
    expect(lines[0]).toContain('playlists.importMissing{"count":7}');
    expect(lines[0]).toContain('playlists.importStreams{"count":2}');
    expect(lines.slice(1)).toEqual(['  First', '  gone1.flac', '  gone2.flac', '  gone3.flac', '  gone4.flac', '  playlists.importMore{"count":2}']);
  });

  it.each([
    { status: 'created' as const, key: 'playlists.importCreated' },
    { status: 'updated' as const, key: 'playlists.importUpdated' },
  ])('says only that a playlist was $status when nothing else happened', ({ status, key }) => {
    const tracks = 'playlists.trackCount{"count":3}';

    expect(describePlaylistImport(t as never, [report({ status })])).toBe(t(key, { name: 'Mix', tracks }));
  });

  it('names five missing entries without counting more', () => {
    const unmatched = Array.from({ length: 5 }, (_, index) => ({ location: `gone${index}.flac`, title: undefined }));

    const lines = describePlaylistImport(t as never, [report({ unmatched })]).split('\n');

    expect(lines).toHaveLength(6);
    expect(lines.at(-1)).toBe('  gone4.flac');
  });

  it('separates the playlists with an empty line', () => {
    expect(describePlaylistImport(t as never, [report({ status: 'updated' }), report({ name: 'Other', status: 'unchanged' })])).toContain(
      '\n\nplaylists.importUnchanged'
    );
  });
});
