import { describe, expect, it } from 'vitest';
import { getSettings, saveSettings } from './settingsRepository';
import { createTestDatabase } from '../test-database';

describe('settingsRepository', () => {
  it('has no settings before they are saved', async () => {
    expect(await getSettings(await createTestDatabase())).toBeUndefined();
  });

  it('returns the last saved settings', async () => {
    const database = await createTestDatabase();

    await saveSettings(database, { volume: 0.2 });
    await saveSettings(database, { volume: 0.7 });

    expect(await getSettings(database)).toEqual({ volume: 0.7 });
  });
});
