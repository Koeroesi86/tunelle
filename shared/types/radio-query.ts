import type { RadioQuery } from './radio';
import { isRecord } from '@shared/utils/is-record';

const maxQueryLength = 100;
const maxOffset = 10000;

/** The fields the stations can be sorted by, mapped to the `order` values of the directory; a sort from outside is checked against these and never put into a URL as it is */
export const radioSortOrders = {
  popularity: 'clickcount',
  name: 'name',
  bitrate: 'bitrate',
  trending: 'clicktrend',
  votes: 'votes',
  country: 'country',
} as const;

export type RadioSortField = keyof typeof radioSortOrders;

export const radioSortFields = Object.keys(radioSortOrders).filter((field): field is RadioSortField => field in radioSortOrders);

/** The minimum bitrates the filter offers, none is any bitrate */
export const radioBitrates = [128, 192, 320] as const;

const clean = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, maxQueryLength) : '');

const findOf = <T>(allowed: readonly T[], value: unknown) => allowed.find((item) => item === value);

/** The default order (popularity, descending) is left out so that a query has one spelling */
const toSort = (value: unknown) => {
  const sort = findOf(radioSortFields, value);

  return sort === 'popularity' ? undefined : sort;
};

const toOffset = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? Math.min(value, maxOffset) : undefined);

/** The filters and the sort of a saved or requested query: text is trimmed and limited, the sort and the bitrate are checked against what is offered, anything else is dropped */
export const parseRadioQuery = (payload: unknown): RadioQuery => {
  const { name, tag, country, language, codec, bitrateMin, sort, descending } = isRecord(payload) ? payload : {};

  return {
    name: clean(name) || undefined,
    tag: clean(tag) || undefined,
    country: clean(country) || undefined,
    language: clean(language) || undefined,
    codec: clean(codec) || undefined,
    bitrateMin: findOf(radioBitrates, bitrateMin),
    sort: toSort(sort),
    descending: descending === false ? false : undefined,
  };
};

/** The query of a renderer message: the filters, and the offset of the page that is asked for */
export const parseRadioSearch = (payload: unknown): RadioQuery => ({
  ...parseRadioQuery(payload),
  offset: toOffset(isRecord(payload) ? payload.offset : undefined),
});

/** The filters that narrow the list, the name and the tag among them; the sort is not one */
export const countRadioFilters = ({ name, tag, country, language, codec, bitrateMin }: RadioQuery) =>
  [name, tag, country, language, codec, bitrateMin].filter((filter) => filter !== undefined).length;

export const isSameRadioQuery = (a: RadioQuery, b: RadioQuery) =>
  a.name === b.name &&
  a.tag === b.tag &&
  a.country === b.country &&
  a.language === b.language &&
  a.codec === b.codec &&
  a.bitrateMin === b.bitrateMin &&
  a.sort === b.sort &&
  a.descending === b.descending &&
  (a.offset ?? 0) === (b.offset ?? 0);
