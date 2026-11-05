import type { RadioSortField } from './radio-query';

export interface RadioStation {
  uuid: string;
  name: string;
  country: string;
  tags: string[];
  codec: string;
  bitrate: number;
  /** The directory has a logo (an http(s) image) for the station; it is served at `/radio-logo/<uuid>` and the address stays in the main process */
  hasLogo?: boolean;
}

export interface RadioTag {
  name: string;
  stationCount: number;
}

/** A value of the directory a list can be filtered by (a country, a language, a codec): what is sent, what is shown and how many stations have it */
export interface RadioOption {
  value: string;
  name: string;
  stationCount: number;
}

export type RadioOptionKind = 'countries' | 'languages' | 'codecs';

/** An empty query lists the most popular stations; the fields combine, the sort is popularity descending unless set */
export interface RadioQuery {
  name?: string;
  tag?: string;
  /** ISO 3166-1 code */
  country?: string;
  language?: string;
  codec?: string;
  /** Stations with a lower bitrate, and the ones that do not tell it, are left out */
  bitrateMin?: number;
  /** The default order is popularity, which is left out */
  sort?: Exclude<RadioSortField, 'popularity'>;
  /** Descending unless false */
  descending?: boolean;
  /** Where the page of stations starts, none is the first page */
  offset?: number;
}
