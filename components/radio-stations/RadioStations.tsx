import { useEffect, useState } from 'react';
import classNames from 'classnames';
import { MdArrowDownward as DescendingIcon, MdArrowUpward as AscendingIcon, MdPlayArrow as PlayIcon } from 'react-icons/md';
import type { RadioOption, RadioQuery, RadioStation } from '../../types/radio';
import { countRadioFilters, parseRadioQuery, radioBitrates, radioPageSize, radioSortFields } from '../../types/radio-query';
import type { RadioSortField } from '../../types/radio-query';
import type { RadioState } from '../../client/redux/radio/reducer';
import { useTranslation } from '../../client/i18n';
import { useDelayedValue } from '../../client/hooks/use-delayed-value';
import { useUpdateEffect } from '../../client/hooks/use-update-effect';
import { stationFavourite } from '../../client/favourites';
import type { Translator } from '../../locales/translate';
import FavouriteButton from '../favourite-button';
import StationLogo from '../station-logo';
import style from './RadioStations.scss';

interface RadioStationsProps {
  radio: RadioState;
  currentStation?: string;
  search: (query: RadioQuery) => void;
  loadTags: () => void;
  loadOptions: () => void;
  play: (station: RadioStation) => void;
}

const searchDelay = 400;

// the columns of the list; the ones with a sort sort it from their header, the names from A and the bitrate from the highest
const columns: { column: 'name' | 'genres' | 'codec' | 'bitrate' | 'country'; sort?: { field: RadioSortField; ascending: boolean } }[] = [
  { column: 'name', sort: { field: 'name', ascending: true } },
  { column: 'genres' },
  { column: 'codec' },
  { column: 'bitrate', sort: { field: 'bitrate', ascending: false } },
  { column: 'country', sort: { field: 'country', ascending: true } },
];

const genresOf = ({ tags }: RadioStation) => tags.slice(0, 3).join(', ');

interface FilterSelectProps {
  label: string;
  allLabel: string;
  value: string | undefined;
  options: RadioOption[];
  onChange: (value: string | undefined) => void;
  formatNumber: Translator['formatNumber'];
}

/** A value that was saved but is not among the loaded ones (the list failed to load) stays selectable as it is */
const FilterSelect = ({ label, allLabel, value, options, onChange, formatNumber }: FilterSelectProps) => (
  <select
    className={classNames(style.select, { [style.active]: Boolean(value) })}
    aria-label={label}
    value={value ?? ''}
    onChange={(event) => onChange(event.target.value || undefined)}
  >
    <option value="">{allLabel}</option>
    {value && !options.some((option) => option.value === value) && <option value={value}>{value}</option>}
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.name} ({formatNumber(option.stationCount)})
      </option>
    ))}
  </select>
);

const RadioStations = ({ radio, currentStation, search, loadTags, loadOptions, play }: RadioStationsProps) => {
  const { t, formatNumber } = useTranslation();
  const { query, offset, hasMore, stations, tags, countries, languages, codecs, loading, error } = radio;
  const filterCount = countRadioFilters(query);
  const change = (changes: RadioQuery) => search({ ...query, ...changes });
  const [name, setName] = useState(query.name ?? '');
  const delayedName = useDelayedValue(name, searchDelay);

  useEffect(() => {
    loadTags();
    loadOptions();
    search(query);
    // the list as it was left, the genres and the values to filter by load when the panel is first shown
  }, []);

  // the saved filters arrive after the panel is shown
  useUpdateEffect(() => setName(query.name ?? ''), [query.name]);

  useUpdateEffect(() => {
    // a search that already has this name (the filters were cleared) is not run again
    if ((delayedName.trim() || undefined) !== query.name) change({ name: delayedName.trim() || undefined });
  }, [delayedName]);

  const sortField = query.sort ?? 'popularity';
  const descending = query.descending !== false;

  // the sorted column flips its direction, any other one starts in its own
  const sortByColumn = (field: RadioSortField, ascending: boolean) =>
    change({ sort: parseRadioQuery({ sort: field }).sort, descending: (field === sortField ? descending : ascending) ? false : undefined });

  const clearFilters = () => {
    setName('');
    search({ sort: query.sort, descending: query.descending });
  };

  return (
    <div className={style.radioStations}>
      <div className={style.controls}>
        <input className={style.search} type="search" placeholder={t('radio.search')} value={name} onChange={(event) => setName(event.target.value)} />
        <div className={style.group} role="group" aria-label={t('radio.filters')}>
          <select
            className={classNames(style.select, { [style.active]: Boolean(query.tag) })}
            aria-label={t('radio.genre')}
            value={query.tag ?? ''}
            onChange={(event) => change({ tag: event.target.value || undefined })}
          >
            <option value="">{t('radio.allGenres')}</option>
            {tags.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.name} ({formatNumber(tag.stationCount)})
              </option>
            ))}
          </select>
          <FilterSelect
            label={t('radio.country')}
            allLabel={t('radio.allCountries')}
            value={query.country}
            options={countries}
            onChange={(country) => change({ country })}
            formatNumber={formatNumber}
          />
          <FilterSelect
            label={t('radio.language')}
            allLabel={t('radio.allLanguages')}
            value={query.language}
            options={languages}
            onChange={(language) => change({ language })}
            formatNumber={formatNumber}
          />
          <FilterSelect
            label={t('radio.codec')}
            allLabel={t('radio.allCodecs')}
            value={query.codec}
            options={codecs}
            onChange={(codec) => change({ codec })}
            formatNumber={formatNumber}
          />
          <select
            className={classNames(style.select, { [style.active]: query.bitrateMin !== undefined })}
            aria-label={t('radio.minimumBitrate')}
            value={query.bitrateMin ?? ''}
            onChange={(event) => change({ bitrateMin: radioBitrates.find((bitrate) => `${bitrate}` === event.target.value) })}
          >
            <option value="">{t('radio.anyBitrate')}</option>
            {radioBitrates.map((bitrate) => (
              <option key={bitrate} value={bitrate}>
                {t('radio.bitrateMinimum', { bitrate })}
              </option>
            ))}
          </select>
          <button className={style.clear} type="button" disabled={filterCount === 0} onClick={clearFilters}>
            {filterCount > 0 ? t('radio.clearFiltersCount', { count: filterCount }) : t('radio.clearFilters')}
          </button>
        </div>
        <div className={classNames(style.group, style.sorting)} role="group" aria-label={t('radio.sorting')}>
          <select
            className={style.select}
            aria-label={t('radio.sortBy')}
            value={sortField}
            onChange={(event) => change({ sort: parseRadioQuery({ sort: event.target.value }).sort })}
          >
            {radioSortFields.map((field) => (
              <option key={field} value={field}>
                {t(`radio.sort.${field}`)}
              </option>
            ))}
          </select>
          <button
            className={style.order}
            type="button"
            aria-label={`${t('radio.direction')}: ${descending ? t('radio.descending') : t('radio.ascending')}`}
            onClick={() => change({ descending: descending ? false : undefined })}
          >
            {descending ? <DescendingIcon size="14px" /> : <AscendingIcon size="14px" />}
          </button>
        </div>
      </div>
      {stations.length > 0 && (
        <div className={classNames(style.stations, style.headerRow)}>
          <div className={classNames(style.station, style.header)}>
            <span />
            {columns.map(({ column, sort }) => (
              <span
                key={column}
                className={classNames({ [style.right]: column === 'bitrate' })}
                role="columnheader"
                aria-sort={sort && sortField === sort.field ? (descending ? 'descending' : 'ascending') : sort ? 'none' : undefined}
              >
                {sort ? (
                  <button type="button" onClick={() => sortByColumn(sort.field, sort.ascending)}>
                    {t(`radio.column.${column}`)}
                    {sortField === sort.field && (descending ? <DescendingIcon size="10px" /> : <AscendingIcon size="10px" />)}
                  </button>
                ) : (
                  t(`radio.column.${column}`)
                )}
              </span>
            ))}
            <span />
          </div>
        </div>
      )}
      <div className={style.stations}>
        {error && <div className={style.message}>{t('radio.error', { error })}</div>}
        {loading && <div className={style.message}>{t('radio.loading')}</div>}
        {!loading && !error && stations.length === 0 && <div className={style.message}>{t('radio.empty')}</div>}
        {stations.map((station) => (
          <div
            key={station.uuid}
            className={classNames(style.station, { [style.current]: station.uuid === currentStation })}
            onDoubleClick={() => play(station)}
          >
            <span className={style.playButton} onClick={() => play(station)}>
              <PlayIcon size={'14px'} />
            </span>
            <span className={style.name}>
              <StationLogo uuid={station.uuid} hasLogo={station.hasLogo} className={style.logo} />
              <span className={style.nameText}>{station.name}</span>
            </span>
            <span className={style.genres}>{genresOf(station)}</span>
            <span>
              {station.codec && (
                <span className={classNames(style.pill, { [style.lossless]: station.codec.toUpperCase() === 'FLAC' })}>{station.codec.toUpperCase()}</span>
              )}
            </span>
            <span className={style.right}>{station.bitrate || <span title={t('radio.bitrateUnknown')}>—</span>}</span>
            <span className={style.country}>{station.country}</span>
            <FavouriteButton item={stationFavourite(station)} className={style.favourite} />
          </div>
        ))}
        <div className={style.message}>{t('radio.source')}</div>
        {hasMore && !loading && (
          <button className={style.loadMore} type="button" onClick={() => search({ ...query, offset: offset + radioPageSize })}>
            {t('radio.loadMore')}
          </button>
        )}
      </div>
    </div>
  );
};

export default RadioStations;
