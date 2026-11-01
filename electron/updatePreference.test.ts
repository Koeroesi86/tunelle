import { mkdtempSync, writeFileSync } from 'fs';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readAutomaticUpdates, saveAutomaticUpdates } from './updatePreference';

describe('the preference for automatic updates', () => {
  let folder = '';

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'tunelle-update-preference-'));
  });
  afterEach(() => rm(folder, { recursive: true, force: true }));

  it('is on when nothing was saved', () => {
    expect(readAutomaticUpdates(folder)).toBe(true);
  });

  it('is on when the folder does not exist', () => {
    expect(readAutomaticUpdates(join(folder, 'missing'))).toBe(true);
  });

  it('keeps the choice of the user', async () => {
    await saveAutomaticUpdates(folder, false);
    expect(readAutomaticUpdates(folder)).toBe(false);

    await saveAutomaticUpdates(folder, true);
    expect(readAutomaticUpdates(folder)).toBe(true);
  });

  it('creates the folder when it is missing', async () => {
    const nested = join(folder, 'nested');

    await saveAutomaticUpdates(nested, false);

    expect(readAutomaticUpdates(nested)).toBe(false);
  });

  it.each(['not json', '{}', 'null', '{"automatic":"no"}'])('is on when the file holds %s', (content) => {
    writeFileSync(join(folder, 'update-preference.json'), content);

    expect(readAutomaticUpdates(folder)).toBe(true);
  });
});
