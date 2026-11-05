import en from './en.json';
import hu from './hu.json';
import { createTranslator, resolveLanguage } from './translate';
import type { Catalog, Translator } from './translate';

/** One file per language; English is the source of truth and complete, a language is added by its file here */
export const catalog = { en, hu } satisfies Catalog;

export const supportedLanguages = Object.keys(catalog);

/** The language's own name in title case, `Magyar` for `hu` (some languages write it in lower case) */
export const getLanguageName = (language: string) => {
  const name = new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;

  return name.charAt(0).toLocaleUpperCase(language) + name.slice(1);
};

export const getTranslator = (picked: string | undefined, systemLanguages: readonly string[]): Translator =>
  createTranslator(resolveLanguage(picked, systemLanguages, supportedLanguages), catalog);
