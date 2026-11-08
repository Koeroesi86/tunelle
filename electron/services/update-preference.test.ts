import { existsSync, mkdtempSync, writeFileSync } from 'fs';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readUpdatePreference, saveUpdatePreference } from './update-preference';

describe('the preference for automatic updates', () => {
  let folder = '';

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'tunelle-update-preference-'));
  });
  afterEach(() => rm(folder, { recursive: true, force: true }));

  it('is on when nothing was saved', () => {
    expect(readUpdatePreference(folder).automatic).toBe(true);
  });

  it('is on when the folder does not exist', () => {
    expect(readUpdatePreference(join(folder, 'missing')).automatic).toBe(true);
  });

  it('keeps the choice of the user', async () => {
    await saveUpdatePreference(folder, { automatic: false });
    expect(readUpdatePreference(folder).automatic).toBe(false);

    await saveUpdatePreference(folder, { automatic: true });
    expect(readUpdatePreference(folder).automatic).toBe(true);
  });

  it('keeps the file inside the folder it was given', async () => {
    await saveUpdatePreference(folder, { automatic: false });

    expect(existsSync(join(folder, 'update-preference.json'))).toBe(true);
  });

  it('creates the folder when it is missing', async () => {
    const nested = join(folder, 'nested');

    await saveUpdatePreference(nested, { automatic: false });

    expect(readUpdatePreference(nested).automatic).toBe(false);
  });

  it.each(['not json', '{}', 'null', '{"automatic":"no"}'])('is on when the file holds %s', (content) => {
    writeFileSync(join(folder, 'update-preference.json'), content);

    expect(readUpdatePreference(folder).automatic).toBe(true);
  });

  it('asks on a metered connection until the user allows it', async () => {
    expect(readUpdatePreference(folder).allowMetered).toBe(false);

    await saveUpdatePreference(folder, { allowMetered: true });

    expect(readUpdatePreference(folder).allowMetered).toBe(true);
  });

  it('keeps the other choice when one is saved', async () => {
    await saveUpdatePreference(folder, { automatic: false });
    await saveUpdatePreference(folder, { allowMetered: true });

    expect(readUpdatePreference(folder)).toEqual({ automatic: false, allowMetered: true });
  });

  it('keeps a choice that is valid when the other one is not', () => {
    writeFileSync(join(folder, 'update-preference.json'), '{"automatic":false,"allowMetered":"yes"}');

    expect(readUpdatePreference(folder)).toEqual({ automatic: false, allowMetered: false });
  });
});
