import { useEffect, useState } from 'react';
import classNames from 'classnames';
import { faPlay, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { Album, Track } from '@shared/types/library';
import { useTranslation } from '../../i18n';
import { useLastDefined } from '../../hooks/use-last-defined';
import { getCoverUrl } from '../../utils/cover-url';
import { getImageTint } from '../../utils/cover-tint';
import { albumFavourite } from '../../domain/favourites';
import style from './AlbumDetails.scss';
import FavouriteButton from '../favourite-button';
import AddToPlaylist from '../add-to-playlist';
import AddToQueue from '../add-to-queue';
import AudioFormatBadge from '../audio-format-badge';
import Time from '../time';

interface AlbumDetailsProps {
  album: Album | null;
  playTracks: (tracks: Track[]) => void;
  close: () => void;
}

const AlbumDetails = ({ album, playTracks, close }: AlbumDetailsProps) => {
  const { t } = useTranslation();
  const shown = useLastDefined(album);
  const displayed: Partial<Album> = { ...shown };
  const [failedCover, setFailedCover] = useState<string | undefined>(undefined);
  const [tint, setTint] = useState<{ url: string; color: string } | undefined>(undefined);
  const coverUrl = displayed.cover ? getCoverUrl(displayed.cover) : undefined;
  const headerColor = tint?.url === coverUrl ? tint?.color : undefined;
  const readTint = (image: HTMLImageElement) => {
    const color = getImageTint(image);
    setTint(coverUrl && color ? { url: coverUrl, color } : undefined);
  };

  // Escape closes it, as a click outside does
  useEffect(() => {
    if (!album) return undefined;

    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && close();
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [album, close]);

  return (
    <>
      {album && <div className={style.backdrop} onClick={close} aria-hidden />}
      <div className={classNames(style.albumDetails, { [style.hasAlbum]: album })}>
        <div className={style.header} style={headerColor ? { background: `linear-gradient(135deg, ${headerColor}, #333333)` } : undefined}>
          <button type="button" className={style.close} aria-label={t('album.close')} onClick={close}>
            <FontAwesomeIcon icon={faTimes} size="lg" />
          </button>
          <div className={style.cover}>
            {coverUrl && coverUrl !== failedCover && (
              <img
                src={coverUrl}
                alt={t('album.cover')}
                crossOrigin="anonymous"
                onError={() => setFailedCover(coverUrl)}
                onLoad={(event) => readTint(event.currentTarget)}
              />
            )}
          </div>
          <div className={style.info}>
            <div className={style.artist}>{displayed.artist}</div>
            <div className={style.title}>{displayed.title}</div>
            {shown && (
              <div className={style.actions}>
                <FavouriteButton item={albumFavourite(shown)} className={style.favourite} />
                <AddToPlaylist source={shown} className={style.addToPlaylist} />
              </div>
            )}
            <div className={style.meta}>
              {displayed.year && <span>{displayed.year}</span>}
              <Time seconds={displayed.duration} />
            </div>
            <div className={style.playButtons}>
              <button type="button" className={style.playAlbum} onClick={() => playTracks(displayed.tracks ?? [])}>
                <FontAwesomeIcon icon={faPlay} size="sm" />
                <span className={style.label}>{t('album.play')}</span>
              </button>
              <AddToQueue withLabel getTracks={() => Promise.resolve(displayed.tracks ?? [])} />
              <AddToQueue next withLabel getTracks={() => Promise.resolve(displayed.tracks ?? [])} />
            </div>
          </div>
        </div>
        <div className={style.tracks}>
          {displayed.tracks?.map((track) => (
            <div key={track.path} className={style.track}>
              <span className={style.number}>{track.track}</span>
              <span className={style.trackTitle}>{track.title}</span>
              <AudioFormatBadge track={track} />
              {track.duration ? <Time seconds={track.duration} /> : null}
              <AddToQueue getTracks={() => Promise.resolve([track])} className={style.trackQueue} />
              <AddToQueue next getTracks={() => Promise.resolve([track])} className={style.trackQueue} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default AlbumDetails;
