import { describe, expect, it } from 'vitest';
import en from './en.json';
import { catalog, getLanguageName, getTranslator, supportedLanguages } from './index';

const placeholdersOf = (message: string) => [...message.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();

// a plural message has a key per category: items_one, items_other
const baseOf = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '');

const english: Record<string, string> = en;
const englishKeys = Object.keys(english);
const translations = Object.entries(catalog).filter(([language]) => language !== 'en');

describe('locales', () => {
  it('ships English first with Hungarian next to it', () => {
    expect(supportedLanguages).toEqual(['en', 'hu']);
  });

  it.each(translations)('%s has no key that English lacks', (_language, messages) => {
    const bases = new Set(englishKeys.map(baseOf));

    expect(Object.keys(messages).filter((key) => !englishKeys.includes(key) && !(baseOf(key) !== key && bases.has(baseOf(key))))).toEqual([]);
  });

  it.each(translations)('%s keeps the placeholders of the English message', (_language, messages) => {
    const changed = Object.entries(messages).filter(
      ([key, message]) => key in english && placeholdersOf(message).join() !== placeholdersOf(english[key]).join()
    );

    expect(changed).toEqual([]);
  });

  it.each(Object.entries(catalog))('%s has no empty message', (_language, messages) => {
    expect(Object.entries(messages).filter(([, message]) => message.trim() === '')).toEqual([]);
  });

  it('names a language in its own language', () => {
    expect(getLanguageName('hu')).toBe('Magyar');
    expect(getLanguageName('en')).toBe('English');
  });

  it('selects the translation of the picked language, the system language and English', () => {
    expect(getTranslator('hu', ['en-US']).t('confirm.yes')).toBe(catalog.hu['confirm.yes']);
    expect(getTranslator(undefined, ['hu-HU']).t('confirm.yes')).toBe(catalog.hu['confirm.yes']);
    expect(getTranslator(undefined, ['de-DE']).t('confirm.yes')).toBe(en['confirm.yes']);
  });
});
