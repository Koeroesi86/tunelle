import type { ReactNode } from 'react';
import classNames from 'classnames';
import { FaPlay } from 'react-icons/fa';
import type { AlbumSummary } from '@shared/types/library';
import { isOffline } from '../../../domain/offline-folders';
import type { TileProps } from '../../../hooks/use-tile-grid';
import { useTranslation } from '../../../i18n';
import style from './AlbumViewThumbnail.scss';
import { coverRouteOf } from '../../../utils/cover-url';
import { tileAccent } from '../../../utils/tile-accent';
import { albumFormatLabel } from '../../../utils/audio-format-label';
import { formatLength } from '../../../utils/format-length';
import { useResolveUrl } from '../../../hooks/use-resolve-url';

/** What a button of the cover needs to sit on it: the classes that place the buttons on the corners, and the tab stop of the tile */
export interface AlbumActionSlot {
  favouriteClass: string;
  playlistClass: string;
  tabIndex: number | undefined;
}

interface AlbumViewThumbnailProps {
  album: AlbumSummary;
  offlineFolders?: string[];
  /** The buttons on the corners of the cover (a favourite, a playlist), which belong to where the album is from; none when omitted */
  renderActions?: (album: AlbumSummary, slot: AlbumActionSlot) => ReactNode;
  selectAlbum: (album: AlbumSummary) => void;
  playAlbum: (album: AlbumSummary) => void;
  /** The place in the grid of the arrow keys: the tile takes the focus, and its buttons are tab stops only while it is the tab stop */
  tile?: TileProps;
}

const noFolders: string[] = [];

const AlbumViewThumbnail = ({ album, offlineFolders = noFolders, renderActions, selectAlbum, playAlbum, tile }: AlbumViewThumbnailProps) => {
  const { t } = useTranslation();
  const resolveUrl = useResolveUrl();
  const offline = isOffline(`${album.path}/`, offlineFolders);
  const cover = album.cover ? { backgroundImage: `url("${resolveUrl(coverRouteOf(album.cover))}")` } : undefined;
  const format = albumFormatLabel(album);
  // the year is missing on a track that has none
  const year = Number(album.year) > 0 ? `${Number(album.year)}` : undefined;
  const length = album.duration === null ? undefined : formatLength(album.duration);
  const facts = [year, album.trackCount > 0 && t('tracks.count', { count: album.trackCount }), length].filter(Boolean).join(' · ');
  // a narrow cover has no room for the number of tracks
  const shortFacts = [year, length].filter(Boolean).join(' · ');

  const tabIndex = tile?.tabIndex;

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the tile holds buttons of its own, so it is a group and not a button. See docs/development/accessibility.md
    <div
      {...tile}
      role="group"
      aria-label={album.title}
      title={offline ? t('folders.offlineHint') : undefined}
      className={classNames(style.albumViewThumbnail, { [style.offline]: offline })}
      onClick={() => selectAlbum(album)}
      onDoubleClick={() => playAlbum(album)}
      onTouchEnd={() => playAlbum(album)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
        event.preventDefault();
        selectAlbum(album);
      }}
    >
      <div className={style.frame} ref={tileAccent(album.accent)}>
        <div title={album.title} className={style.cover} style={cover}>
          {renderActions?.(album, { favouriteClass: style.favourite, playlistClass: style.playlist, tabIndex })}
          <button
            type="button"
            className={style.play}
            tabIndex={tabIndex}
            aria-label={t('albums.play', { title: album.title })}
            onClick={(event) => {
              event.stopPropagation();
              playAlbum(album);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <FaPlay aria-hidden />
          </button>
        </div>
      </div>
      <button
        type="button"
        className={style.title}
        tabIndex={tabIndex}
        title={album.title}
        onClick={(event) => {
          event.stopPropagation();
          selectAlbum(album);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {album.title}
      </button>
      <div className={style.artist} title={album.artist}>
        {album.artist}
      </div>
      <div className={style.details}>
        <span className={style.facts}>{facts}</span>
        <span className={style.shortFacts}>{shortFacts}</span>
        {format && <span className={style.format}>{format}</span>}
      </div>
    </div>
  );
};

export default AlbumViewThumbnail;
