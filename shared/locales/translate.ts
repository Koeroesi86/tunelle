import en from './en.json';

export type Messages = Record<string, string>;
export type Catalog = Record<string, Messages>;

type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type BaseKey<K> = K extends `${infer Base}_${PluralCategory}` ? Base : K;

/** The keys of the English messages, a plural message is addressed without its category (`items_one` and `items_other` are `items`) */
export type MessageKey = BaseKey<keyof typeof en>;
export type Values = Record<string, string | number>;
export type Translate = (key: MessageKey, values?: Values) => string;

export interface Translator {
  language: string;
  t: Translate;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const defaultLanguage = 'en';

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

/** The supported language a tag selects, the most specific tag first and then its base language: `pt-BR` -> `pt` */
export const matchLanguage = (tag: string | undefined, supported: readonly string[]) => {
  const parts = (tag ?? '').replace(/_/g, '-').split('-').filter(Boolean);

  return parts
    .map((_, index) =>
      parts
        .slice(0, parts.length - index)
        .join('-')
        .toLowerCase()
    )
    .map((candidate) => supported.find((language) => language.toLowerCase() === candidate))
    .find(isDefined);
};

/** The language the picked one, then the first matching one of the system, then English selects */
export const resolveLanguage = (picked: string | undefined, systemLanguages: readonly string[], supported: readonly string[]) =>
  [picked, ...systemLanguages].map((tag) => matchLanguage(tag, supported)).find(isDefined) ?? defaultLanguage;

const messageKeys = (language: string, key: string, values?: Values) =>
  typeof values?.count === 'number' ? [`${key}_${new Intl.PluralRules(language).select(values.count)}`, `${key}_other`, key] : [key];

const interpolate = (message: string, values: Values = {}) => message.replace(/\{(\w+)\}/g, (placeholder, name: string) => `${values[name] ?? placeholder}`);

/** Any single missing message shows the English one, and a message English lacks too shows its key */
export const createTranslator = (language: string, catalog: Catalog, fallback: Messages = en): Translator => ({
  language,
  t: (key, values) => {
    const keys = messageKeys(language, key, values);
    const message = [catalog[language] ?? {}, fallback].flatMap((messages) => keys.map((candidate) => messages[candidate])).find(isDefined);

    return message === undefined ? key : interpolate(message, values);
  },
  formatNumber: (value, options) => new Intl.NumberFormat(language, options).format(value),
});
