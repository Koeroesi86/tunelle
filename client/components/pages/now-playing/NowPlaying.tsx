import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import classNames from 'classnames';
import slugify from 'slugify';
import { MdClose as RemoveIcon, MdMusicNote as NoteIcon, MdPlayArrow as PlayIcon } from 'react-icons/md';
import type { Track } from '@shared/types/library';
import { toNowPlaying } from '../../../domain/now-playing';
import { radioUuidOf } from '../../../domain/radio-track';
import type { RadioStation } from '@shared/types/radio';
import { useTranslation } from '../../../i18n';
import { useDragReorder } from '../../../hooks/use-drag-reorder';
import { trackFavourite } from '../../../domain/favourites';
import style from './NowPlaying.scss';
import AudioFormatBadge from '../../ui/audio-format-badge';
import CoverFade from '../../ui/cover-fade';
import FavouriteButton from '../../ui/favourite-button';
import LoudnessPanel from '../../ui/loudness-panel';
import Time from '../../ui/time';

interface NowPlayingProps {
  nowPlaying: Track[];
  currentSong: Track | null;
  streamTitle: string | null;
  streamArt: string | null;
  /** The sample rate found in the stream of the station that plays */
  streamSampleRate: number | null;
  isPlaying: boolean;
  /** The station that was played last */
  station?: RadioStation;
  playTrack: (track: Track) => void;
  moveTrack: (from: number, to: number) => void;
  removeTrack: (index: number) => void;
  clearQueue: () => void;
  openLibrary: () => void;
}

/** How far Alt and the arrow keys move a row */
const arrowSteps: Record<string, number | undefined> = { ArrowUp: -1, ArrowDown: 1 };

const NowPlaying = ({
  nowPlaying,
  currentSong,
  streamTitle,
  streamArt,
  streamSampleRate,
  isPlaying,
  station,
  playTrack,
  moveTrack,
  removeTrack,
  clearQueue,
  openLibrary,
}: NowPlayingProps) => {
  const { t } = useTranslation();
  const shown = currentSong ? toNowPlaying(currentSong, streamTitle, streamArt) : undefined;
  const [confirming, setConfirming] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLDivElement>(null);
  // the place of the row that was moved with the keyboard: a row that moves in the page loses the focus
  const movedTo = useRef<number | undefined>(undefined);
  // a track is identified by its place in the queue, it can be in it more than once
  const { itemProps, overIndex } = useDragReorder(moveTrack);

  // the keyboard moves the row that has the focus, not a button inside it
  const moveWithKeys = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    const step = event.altKey && event.target === event.currentTarget ? arrowSteps[event.key] : undefined;
    if (!step) return;

    event.preventDefault();
    // the first row has no place above and the last none below
    if (index + step < 0 || index + step >= nowPlaying.length) return;

    movedTo.current = index + step;
    moveTrack(index, index + step);
  };

  useEffect(() => {
    if (movedTo.current === undefined) return;

    list.current?.querySelectorAll<HTMLElement>('[tabindex]')[movedTo.current]?.focus();
    movedTo.current = undefined;
  }, [nowPlaying]);

  // the list opens, and follows the song, with the current track in the middle
  useEffect(() => {
    if (!list.current || !current.current) return;
    list.current.scrollTop = current.current.offsetTop - (list.current.clientHeight - current.current.offsetHeight) / 2;
  }, [currentSong?.path]);

  if (!currentSong && nowPlaying.length === 0) {
    return (
      <div className={style.nowPlaying}>
        <div className={style.empty}>
          <NoteIcon className={style.emptyIcon} size="36px" />
          <div className={style.emptyTitle}>{t('nowPlaying.nothing')}</div>
          <div>{t('nowPlaying.nothingHint')}</div>
          <button type="button" className={style.emptyButton} onClick={openLibrary}>
            {t('nowPlaying.openLibrary')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={style.nowPlaying}>
      <div className={style.contents}>
        {currentSong && shown && (
          <div className={style.currentSong}>
            <CoverFade className={style.cover} src={shown.cover} />
            <div className={style.meta}>
              <div className={style.title}>{shown.track.title}</div>
              <div className={style.artist}>{shown.track.artist}</div>
              <div className={style.album}>{[shown.track.album, shown.track.year || undefined].filter(Boolean).join(' · ')}</div>
              <div className={style.actions}>
                <AudioFormatBadge track={shown.track} />
                <FavouriteButton item={trackFavourite(currentSong, station)} className={style.favourite} />
              </div>
              {radioUuidOf(currentSong.path) === undefined ? (
                <LoudnessPanel path={currentSong.path} duration={currentSong.duration ?? undefined} sampleRate={currentSong.sampleRate ?? undefined} />
              ) : (
                <LoudnessPanel sampleRate={streamSampleRate ?? undefined} />
              )}
            </div>
          </div>
        )}
        <div className={style.queue}>
          <div className={style.queueHeader}>
            <span>
              {t('nowPlaying.upNext')} · {t('tracks.count', { count: nowPlaying.length })}
            </span>
            <span className={style.queueTotals}>
              <Time seconds={nowPlaying.reduce((total, track) => total + (track.duration || 0), 0)} />
              {/* the song that plays stops with the queue */}
              <button
                type="button"
                className={classNames(style.clearButton, { [style.confirming]: confirming })}
                onClick={() => {
                  if (confirming) clearQueue();
                  setConfirming(!confirming);
                }}
                onBlur={() => setConfirming(false)}
              >
                {confirming ? t('nowPlaying.clearConfirm') : t('nowPlaying.clear')}
              </button>
            </span>
          </div>
          <div className={style.tracks} ref={list}>
            {nowPlaying.map((track, index) => {
              const isCurrent = !!currentSong && track.path === currentSong.path;

              return (
                <div
                  key={`now-playing-track-${slugify(track.path, { remove: /[*+~./()'",!:@\\]/g, lower: true })}`}
                  ref={isCurrent ? current : undefined}
                  className={classNames(style.track, { [style.current]: isCurrent, [style.dropTarget]: overIndex === index })}
                  onDoubleClick={() => playTrack(track)}
                  title={`#${index + 1} ${track.title}`}
                  tabIndex={0}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                  onKeyDown={(event) => moveWithKeys(event, index)}
                  {...itemProps(index, index)}
                >
                  <span className={style.number}>
                    <span className={style.numberText}>
                      {isCurrent ? (
                        <span className={classNames(style.meter, { [style.paused]: !isPlaying })} aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : (
                        index + 1
                      )}
                    </span>
                    <button
                      type="button"
                      className={style.playButton}
                      aria-label={t('nowPlaying.play', { title: track.title })}
                      onClick={() => playTrack(track)}
                    >
                      <PlayIcon size="16px" />
                    </button>
                  </span>
                  <span className={style.name}>{track.title}</span>
                  <span className={style.format}>
                    <AudioFormatBadge track={track} />
                  </span>
                  <span className={style.duration}>{track.duration ? <Time seconds={track.duration} /> : null}</span>
                  {/* the song that plays stays: taking it out would make the next one start from the top of the queue */}
                  <button
                    type="button"
                    className={style.removeButton}
                    disabled={isCurrent}
                    aria-label={t('nowPlaying.remove', { title: track.title })}
                    title={t('nowPlaying.remove', { title: track.title })}
                    onClick={() => removeTrack(index)}
                  >
                    <RemoveIcon size="14px" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NowPlaying;
