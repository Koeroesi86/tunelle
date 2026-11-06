import { z } from 'zod';

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

export type RadioQuery = z.infer<typeof radioSearchSchema>;

export type RadioSortField = keyof typeof radioSortOrders;

export const radioSortFields = ['popularity', 'name', 'bitrate', 'trending', 'votes', 'country'] as const satisfies readonly RadioSortField[];

/** The minimum bitrates the filter offers, none is any bitrate */
export const radioBitrates = [128, 192, 320] as const;

const text = z
  .string()
  .transform((value) => value.trim().slice(0, maxQueryLength) || undefined)
  .optional()
  .catch(undefined);

/** The default order (popularity, descending) is left out so that a query has one spelling */
const sortSchema = z
  .enum(radioSortFields)
  .transform((sort) => (sort === 'popularity' ? undefined : sort))
  .optional()
  .catch(undefined);

const offsetSchema = z
  .number()
  .int()
  .positive()
  .transform((offset) => Math.min(offset, maxOffset))
  .optional()
  .catch(undefined);

export const radioQuerySchema = z.object({
  name: text,
  tag: text,
  country: text,
  language: text,
  codec: text,
  bitrateMin: z.literal(radioBitrates).optional().catch(undefined),
  sort: sortSchema,
  descending: z.literal(false).optional().catch(undefined),
});

/** An empty query lists the most popular stations; the fields combine, the sort is popularity descending unless set */
export const radioSearchSchema = radioQuerySchema.extend({ offset: offsetSchema });

/** The filters and the sort of a saved or requested query: text is trimmed and limited, the sort and the bitrate are checked against what is offered, anything else is dropped */
export const parseRadioQuery = (payload: unknown): RadioQuery => radioQuerySchema.safeParse(payload).data ?? radioQuerySchema.parse({});

/** The query of a renderer message: the filters, and the offset of the page that is asked for */
export const parseRadioSearch = (payload: unknown): RadioQuery => radioSearchSchema.safeParse(payload).data ?? radioSearchSchema.parse({});

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
