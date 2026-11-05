import { errorMessage } from '@shared/utils/error-message';
import type { Translator } from '@shared/locales/translate';
import { NewerLibraryError } from '../database/migrate';

/** What to tell the user when the library could not be opened */
export const libraryErrorMessage = ({ t }: Translator, error: unknown) =>
  error instanceof NewerLibraryError ? t('library.error.newer') : t('library.error.failed', { message: errorMessage(error) });
