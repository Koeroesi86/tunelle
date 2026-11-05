import { app } from 'electron';
import { getTranslator } from '@shared/locales';
import type { Translator } from '@shared/locales/translate';

let picked: string | undefined;
const listeners = new Set<() => void>();

/** The text of the main process in the language picked in the settings, otherwise in the system language of the app, otherwise in English */
export const getMainTranslator = (): Translator => getTranslator(picked, [app.getLocale()]);

/** Calls the listener when the picked language changed, so the text it shows can be set again */
export const onLanguageChange = (listener: () => void) => listeners.add(listener);

/** The language of the saved settings, undefined where none was picked */
export const languageOf = (settings: unknown) =>
  typeof settings === 'object' && settings !== null && 'language' in settings && typeof settings.language === 'string' ? settings.language : undefined;

export const setPickedLanguage = (settings: unknown) => {
  const language = languageOf(settings);
  if (language === picked) return;

  picked = language;
  listeners.forEach((listener) => listener());
};
