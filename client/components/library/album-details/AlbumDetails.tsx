import { useEffect, useId, useState } from 'react';
import { faArrowLeft, faPlay } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { Album, Track } from '@shared/types/library';
import { useTranslation } from '../../../i18n';
import { getCoverUrl } from '../../../utils/cover-url';
import { useDialogFocus } from '../../../hooks/use-dialog-focus';
import { getImageTint } from '../../../utils/cover-tint';
import { albumFavourite } from '../../../domain/favourites';
import style from './AlbumDetails.scss';
import FavouriteButton from '../../ui/favourite-button';
import AddToPlaylist from '../add-to-playlist';
import AddToQueue from '../add-to-queue';
import AlbumCoverMenu from '../album-cover-menu';
import AudioFormatBadge from '../../ui/audio-format-badge';
import Time from '../../ui/time';

interface AlbumDetailsProps {
  album: Album | null;
  playTracks: (tracks: Track[]) => void;
  close: () => void;
}

/** The page of an open album, over the library: its cover, what can be done with it and its tracks; Escape and the button on top go back */
const AlbumDetails = ({ album, playTracks, close }: AlbumDetailsProps) => {
  const { t } = useTranslation();
  const titleId = useId();
  const dialog = useDialogFocus(album !== null);
  const displayed: Partial<Album> = { ...album };
  const [failedCover, setFailedCover] = useState<string | undefined>(undefined);
  const [loadedCover, setLoadedCover] = useState<string | undefined>(undefined);
  const [tint, setTint] = useState<{ url: string; color: string } | undefined>(undefined);
  const coverUrl = displayed.cover ? getCoverUrl(displayed.cover) : undefined;
  const headerColor = tint?.url === coverUrl ? tint?.color : undefined;
  const readTint = (image: HTMLImageElement) => {
    const color = getImageTint(image);
    setTint(coverUrl && color ? { url: coverUrl, color } : undefined);
  };

  // Escape goes back, unless it closed the menu of the cover, which marks it as used
  useEffect(() => {
    if (!album) return undefined;

    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && !event.defaultPrevented && close();
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [album, close]);

  if (!album) return null;

  return (
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} className={style.albumDetails}>
      <div className={style.header} style={headerColor ? { background: `linear-gradient(135deg, ${headerColor}, var(--panel-solid))` } : undefined}>
        <button type="button" className={style.close} aria-label={t('album.close')} onClick={close}>
          <FontAwesomeIcon icon={faArrowLeft} size="sm" />
          {t('album.close')}
        </button>
        <div className={style.top}>
          <div className={style.cover}>
            {coverUrl && coverUrl !== failedCover && (
              <img
                src={coverUrl}
                alt={t('album.cover')}
                crossOrigin="anonymous"
                onError={() => setFailedCover(coverUrl)}
                className={coverUrl === loadedCover ? style.loaded : undefined}
                onLoad={(event) => {
                  setLoadedCover(coverUrl);
                  readTint(event.currentTarget);
                }}
              />
            )}
          </div>
          <div className={style.info}>
            <div className={style.artist}>{displayed.artist}</div>
            <div id={titleId} className={style.title}>
              {displayed.title}
            </div>
            <div className={style.actions}>
              <FavouriteButton item={albumFavourite(album)} className={style.favourite} />
              <AddToPlaylist source={album} className={style.addToPlaylist} />
            </div>
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
      </div>
      <div className={style.body}>
        {/* another album starts with its own text and results */}
        <AlbumCoverMenu key={album.id} path={album.path} title={album.title} artist={album.artist} />
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
    </div>
  );
};

export default AlbumDetails;
