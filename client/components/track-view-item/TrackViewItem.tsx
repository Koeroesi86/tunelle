import { memo } from 'react';
import type { MouseEventHandler, ReactNode } from 'react';
import classNames from 'classnames';
import { FaCaretDown, FaCaretUp } from 'react-icons/fa';
import type { Track } from '@shared/types/library';
import type { TrackSort, TrackSortField } from '@shared/types/library-query';
import { trackFavourite } from '../../domain/favourites';
import { useTranslation } from '../../i18n';
import style from './TrackViewItem.scss';
import Time from '../time';
import FavouriteButton from '../favourite-button';
import AudioFormatBadge from '../audio-format-badge';
import AddToPlaylist from '../add-to-playlist';
import AddToQueue from '../add-to-queue';

/** The header row displays labels in place of the track values */
export type TrackLabels = Record<'duration' | 'artist' | 'year' | 'album' | 'track' | 'title', string>;

interface TrackViewItemFieldProps {
  onClick?: MouseEventHandler<HTMLDivElement>;
  className?: string;
  children?: ReactNode;
}

const TrackViewItemField = ({ onClick = () => {}, className = '', children = null }: TrackViewItemFieldProps) => (
  <div className={classNames(style.field, className)} onClick={onClick}>
    {children}
  </div>
);

interface TrackViewHeaderFieldProps {
  field: TrackSortField;
  className: string;
  label: string;
  sort: TrackSort | undefined;
  onSort: (field: TrackSortField) => void;
}

const ariaSorts = { asc: 'ascending', desc: 'descending' } as const;

/** A column header that sorts by its column when it is clicked, and shows the direction while it is the sorted column */
const TrackViewHeaderField = ({ field, className, label, sort, onSort }: TrackViewHeaderFieldProps) => {
  const active = sort?.field === field ? sort : undefined;

  return (
    <div role="columnheader" aria-sort={active ? ariaSorts[active.direction] : 'none'} className={classNames(style.field, style.sortable, className)}>
      <button type="button" onClick={() => onSort(field)}>
        {label}
        {active?.direction === 'asc' && <FaCaretUp aria-hidden />}
        {active?.direction === 'desc' && <FaCaretDown aria-hidden />}
      </button>
    </div>
  );
};

interface TrackViewItemProps {
  track: Track | TrackLabels;
  /** The sort of the list and how to change it, the header sorts by a column when it has them */
  sort?: TrackSort;
  onSort?: (field: TrackSortField) => void;
  isHeader?: boolean;
  isSelected?: boolean;
  isCurrent?: boolean;
  /** The track is in a library folder that cannot be reached right now */
  isOffline?: boolean;
  clickTrack?: (track: Track) => void;
  doubleClickTrack?: (track: Track) => void;
}

const TrackViewItem = ({
  track,
  isSelected = false,
  isCurrent = false,
  isOffline = false,
  isHeader = false,
  sort,
  onSort,
  clickTrack = () => {},
  doubleClickTrack = () => {},
}: TrackViewItemProps) => {
  const { t } = useTranslation();

  const renderField = (field: TrackSortField, className: string, content: ReactNode) =>
    isHeader && onSort && !('path' in track) ? (
      <TrackViewHeaderField field={field} className={className} label={track[field]} sort={sort} onSort={onSort} />
    ) : (
      <TrackViewItemField className={className}>{content}</TrackViewItemField>
    );

  return (
    <div
      title={isOffline ? t('folders.offlineHint') : undefined}
      className={classNames(style.trackViewItem, {
        [style.offline]: isOffline,
        [style.header]: isHeader,
        [style.selected]: isSelected,
        [style.current]: isCurrent,
      })}
      onClick={() => 'path' in track && clickTrack(track)}
      onDoubleClick={() => 'path' in track && doubleClickTrack(track)}
    >
      <TrackViewItemField className={style.playing}>{isCurrent && <span className={style.bars} aria-hidden />}</TrackViewItemField>
      {renderField('track', style.trackNo, track.track || '-')}
      {renderField('title', style.title, track.title || '-')}
      {renderField('artist', style.artist, track.artist || '-')}
      {renderField('album', style.album, track.album || '-')}
      {renderField('year', style.year, track.year || '-')}
      <TrackViewItemField className={style.format}>
        {'path' in track && <AudioFormatBadge track={track} className={classNames(style.pill, { [style.lossless]: track.lossless })} />}
      </TrackViewItemField>
      <TrackViewItemField className={style.actions}>
        {'path' in track && (
          <>
            <FavouriteButton item={trackFavourite(track)} className={style.heart} />
            <AddToPlaylist source={track} className={style.action} />
            <AddToQueue getTracks={() => Promise.resolve([track])} className={style.action} />
            <AddToQueue next getTracks={() => Promise.resolve([track])} className={style.action} />
          </>
        )}
      </TrackViewItemField>
      {renderField('duration', style.duration, typeof track.duration === 'string' ? track.duration : <Time seconds={track.duration} />)}
    </div>
  );
};

export default memo(TrackViewItem);
