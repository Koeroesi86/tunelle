import classNames from 'classnames';
import { FaPlay } from 'react-icons/fa';
import type { AlbumSummary } from '@shared/types/library';
import { isOffline } from '../../../domain/offline-folders';
import { useTranslation } from '../../../i18n';
import style from './AlbumViewThumbnail.scss';
import { getCoverUrl } from '../../../utils/cover-url';
import { tileAccent } from '../../../utils/tile-accent';
import { albumFormatLabel } from '../../../utils/audio-format-label';
import { formatLength } from '../../../utils/format-length';
import { albumFavourite } from '../../../domain/favourites';
import FavouriteButton from '../../ui/favourite-button';
import AddToPlaylist from '../add-to-playlist';

interface AlbumViewThumbnailProps {
  album: AlbumSummary;
  offlineFolders: string[];
  selectAlbum: (album: AlbumSummary) => void;
  playAlbum: (album: AlbumSummary) => void;
}

const AlbumViewThumbnail = ({ album, offlineFolders, selectAlbum, playAlbum }: AlbumViewThumbnailProps) => {
  const { t } = useTranslation();
  const offline = isOffline(`${album.path}/`, offlineFolders);
  const cover = album.cover ? { backgroundImage: `url("${getCoverUrl(album.cover)}")` } : undefined;
  const format = albumFormatLabel(album);
  // the year is missing on a track that has none
  const year = Number(album.year) > 0 ? `${Number(album.year)}` : undefined;
  const length = formatLength(album.duration);
  const facts = [year, t('tracks.count', { count: album.trackCount }), length].filter(Boolean).join(' · ');
  // a narrow cover has no room for the number of tracks
  const shortFacts = [year, length].filter(Boolean).join(' · ');

  return (
    <div
      title={offline ? t('folders.offlineHint') : undefined}
      className={classNames(style.albumViewThumbnail, { [style.offline]: offline })}
      onClick={() => selectAlbum(album)}
      onDoubleClick={() => playAlbum(album)}
      onTouchEnd={() => playAlbum(album)}
    >
      <div className={style.frame} ref={tileAccent(album.accent)}>
        <div title={album.title} className={style.cover} style={cover}>
          <FavouriteButton item={albumFavourite(album)} className={style.favourite} />
          <AddToPlaylist source={album} className={style.playlist} />
          <button
            type="button"
            className={style.play}
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
