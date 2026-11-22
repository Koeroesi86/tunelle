import type { RadioOption, RadioQuery, RadioStation, RadioTag } from '@shared/types/radio';

/** What the radio page shows: the search, the loaded page of the stations and the options to filter by */
export interface RadioState {
  /** The filters and the sort of the list, the page is apart */
  query: RadioQuery;
  /** Where the loaded page of the stations starts */
  offset: number;
  /** Whether the directory may have stations after the loaded page */
  hasMore: boolean;
  stations: RadioStation[];
  tags: RadioTag[];
  countries: RadioOption[];
  languages: RadioOption[];
  codecs: RadioOption[];
  loading: boolean;
  /** The station that was played last, for what needs more than the radio track knows of it */
  playing?: RadioStation;
  error?: string;
}
