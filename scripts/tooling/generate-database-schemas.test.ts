import { describe, expect, it, vi } from 'vitest';
import { fileNameOf, generateTableSchema, readTables, schemaNameOf, zodTypeOf } from './generate-database-schemas';

describe('generate-database-schemas', () => {
  it.each([
    ['INTEGER', 'z.number()'],
    ['REAL', 'z.number()'],
    ['NUMERIC', 'z.number()'],
    ['TEXT', 'z.string()'],
    ['VARCHAR(20)', 'z.string()'],
    ['BLOB', 'z.instanceof(Buffer)'],
    ['', 'z.unknown()'],
  ])('reads the declared type %s as %s', (declared, expected) => {
    expect(zodTypeOf(declared)).toBe(expected);
  });

  it('names the schema and the file after the table', () => {
    expect(schemaNameOf('playlist_tracks')).toBe('playlistTracksRowSchema');
    expect(fileNameOf('playlist_tracks')).toBe('playlist-tracks.ts');
  });

  it('lets a column be NULL only when it is neither NOT NULL nor in the primary key', () => {
    const schema = generateTableSchema('things', [
      { name: 'id', type: 'INTEGER', notnull: 0, pk: 1 },
      { name: 'label', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'note', type: 'TEXT', notnull: 0, pk: 0 },
    ]);

    expect(schema).toContain('  id: z.number(),');
    expect(schema).toContain('  label: z.string(),');
    expect(schema).toContain('  note: z.string().nullable(),');
    expect(schema).toContain('export const thingsRowSchema');
  });

  it('warns about a column without a declared type and reads it as unknown', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const schema = generateTableSchema('things', [{ name: 'data', type: '', notnull: 0, pk: 0 }]);

    expect(schema).toContain('  data: z.unknown().nullable(),');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('things.data has no declared type'));
  });

  it('finds the tables of the migrations', async () => {
    const tables = await readTables();

    expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining(['library', 'favourites', 'playlist_tracks']));
    expect(tables.find(({ name }) => name === 'library')?.columns.map(({ name }) => name)).toContain('albumArtist');
  });
});
