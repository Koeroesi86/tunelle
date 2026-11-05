import { describe, expect, it } from 'vitest';
import { getTranslator } from '@shared/locales';
import { libraryErrorMessage } from './library-error-message';
import { NewerLibraryError } from '../database/migrate';

describe('libraryErrorMessage', () => {
  const translator = getTranslator('en', []);

  it('tells to update the app when the library is from a newer one', () => {
    expect(libraryErrorMessage(translator, new NewerLibraryError(7, 6))).toBe(translator.t('library.error.newer'));
  });

  it.each([
    [new Error('no such table'), 'no such table'],
    ['SQLITE_CORRUPT', 'SQLITE_CORRUPT'],
  ])('shows what failed for %j', (error, message) => {
    expect(libraryErrorMessage(translator, error)).toContain(message);
  });
});
