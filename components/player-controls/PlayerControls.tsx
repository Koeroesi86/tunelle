import { useRef } from 'react';
import type { ReactNode } from 'react';
import classNames from 'classnames';
import {
  FiBarChart2 as EQIcon,
  FiVolumeX as VolumeOffIcon,
  FiVolume2 as VolumeFullIcon,
  FiSkipForward as ForwardIcon,
  FiSkipBack as BackIcon,
  FiShuffle as ShuffleIcon,
  FiRepeat as RepeatIcon,
} from 'react-icons/fi';
import { MdPlayArrow as PlayIcon, MdPause as PauseIcon } from 'react-icons/md';
import Slider from '../slider/Slider';
import type { Track } from '../../types/library';
import { toNowPlaying } from '../../client/now-playing';
import { radioUuidOf } from '../../client/radio-track';
import { useMediaSession, useMediaSessionActions } from '../../client/hooks/use-media-session';
import { useAudioListener } from '../../client/hooks/use-audio-listener';
import { useUpdateEffect } from '../../client/hooks/use-update-effect';
import { useTranslation } from '../../client/i18n';
import style from './PlayerControls.scss';
import LiveShimmer from '../live-shimmer';
import AudioFormatBadge from '../audio-format-badge';
import Time from '../time';
import CoverFade from '../cover-fade';

interface PlayerControlsProps {
  currentSong: Track | null;
  streamTitle: string | null;
  streamArt: string | null;
  currentTime: number;
  volume: number;
  shuffle: boolean;
  repeat: boolean;
  isPlaying: boolean;
  addPlayStatusListener: (listener: (isPlaying: boolean) => void) => void;
  addTimeChangeListener: (listener: (currentTime: number) => void) => void;
  seek: (to: number) => void;
  play: () => void;
  pause: () => void;
  setCurrentTime: (currentTime: number) => void;
  setPlaying: (isPlaying: boolean) => void;
  setVolume: (volume: number | string) => void;
  openEqualizer: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  nextSong: () => void;
  previousSong: () => void;
}

const round = (number: number) => Math.floor(number * 100);

interface IconButtonProps {
  label: string;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}

const IconButton = ({ label, className = style.icon, onClick, children }: IconButtonProps) => (
  <button className={className} onClick={onClick} title={label} aria-label={label}>
    {children}
  </button>
);

const TrackDetails = ({ currentSong, streamTitle, streamArt }: Pick<PlayerControlsProps, 'currentSong' | 'streamTitle' | 'streamArt'>) => {
  const { t } = useTranslation();
  const shown = currentSong ? toNowPlaying(currentSong, streamTitle, streamArt) : undefined;

  useMediaSession(shown && { title: shown.track.title, artist: shown.track.artist, album: shown.track.album, cover: shown.cover });

  return (
    <div className={style.meta}>
      <CoverFade className={style.picture} src={shown?.cover} />
      <div className={style.details}>
        <div className={style.title}>{shown ? shown.track.title : t('player.none')}</div>
        <div className={style.album}>{shown ? shown.track.album : t('player.none')}</div>
        <div className={style.artist}>{shown ? shown.track.artist : t('player.none')}</div>
        {shown && (
          <div className={style.format}>
            <AudioFormatBadge track={shown.track} />
          </div>
        )}
      </div>
    </div>
  );
};

type TransportButtonsProps = Pick<
  PlayerControlsProps,
  'currentSong' | 'isPlaying' | 'shuffle' | 'repeat' | 'play' | 'pause' | 'previousSong' | 'nextSong' | 'toggleShuffle' | 'toggleRepeat'
>;

const TransportButtons = ({
  currentSong,
  isPlaying,
  shuffle,
  repeat,
  play,
  pause,
  previousSong,
  nextSong,
  toggleShuffle,
  toggleRepeat,
}: TransportButtonsProps) => {
  const { t } = useTranslation();

  return (
    <div className={style.mainControlButtons}>
      <button className={classNames(style.controlButton, { [style.active]: shuffle })} onClick={toggleShuffle} title={t('player.shuffle')}>
        <ShuffleIcon size={'12px'} />
      </button>
      <button className={style.controlButton} onClick={previousSong} title={t('player.previous')}>
        <BackIcon size={'16px'} />
      </button>
      <button
        onClick={isPlaying ? pause : play}
        className={style.playToggleButton}
        disabled={!currentSong}
        title={isPlaying ? t('player.pause') : t('player.play')}
      >
        {isPlaying ? <PauseIcon size={'22px'} /> : <PlayIcon size={'22px'} />}
      </button>
      <button className={style.controlButton} onClick={nextSong} title={t('player.next')}>
        <ForwardIcon size={'16px'} />
      </button>
      <button className={classNames(style.controlButton, { [style.active]: repeat })} onClick={toggleRepeat} title={t('player.repeat')}>
        <RepeatIcon size={'12px'} />
      </button>
    </div>
  );
};

/** A station has no position to seek to: the label and the time listened keep the row of the seek bar, the shimmer takes its place */
const LiveRow = ({ isPlaying, currentTime }: Pick<PlayerControlsProps, 'isPlaying' | 'currentTime'>) => {
  const { t } = useTranslation();

  return (
    <div className={classNames(style.live, { [style.playing]: isPlaying })}>
      <span className={style.liveLabel}>
        <i className={style.liveDot} />
        {t('player.live')}
      </span>
      <div className={style.progress}>
        <LiveShimmer isPlaying={isPlaying} />
      </div>
      <span className={classNames(style.time, style.total)}>
        <Time seconds={currentTime} />
      </span>
    </div>
  );
};

const SeekBar = ({ currentSong, currentTime, setCurrentTime }: Pick<PlayerControlsProps, 'currentSong' | 'currentTime' | 'setCurrentTime'>) => (
  <div className={style.seek}>
    <span className={style.time}>
      <Time seconds={currentTime} />
    </span>
    <div className={style.progress}>
      <Slider min={0} max={currentSong?.duration ?? 0} step={0.0001} value={currentTime} onInput={(e) => setCurrentTime(parseFloat(e.currentTarget.value))} />
    </div>
    <span className={classNames(style.time, style.total)}>
      <Time seconds={currentSong ? currentSong.duration : 0} />
    </span>
  </div>
);

const VolumeControls = ({ volume, setVolume, openEqualizer }: Pick<PlayerControlsProps, 'volume' | 'setVolume' | 'openEqualizer'>) => {
  const { t } = useTranslation();
  const volumeBeforeMute = useRef(0.5);

  const toggleMute = () => {
    if (volume > 0) volumeBeforeMute.current = volume;
    setVolume(volume > 0 ? 0 : volumeBeforeMute.current);
  };

  return (
    <div className={style.volume}>
      <IconButton label={t('player.equalizer')} onClick={openEqualizer}>
        <EQIcon size={'16px'} />
      </IconButton>
      <IconButton label={volume > 0 ? t('player.mute') : t('player.unmute')} onClick={toggleMute}>
        <VolumeOffIcon size={'16px'} />
      </IconButton>
      <div className={style.slider}>
        <Slider min={0} max={1} step={0.01} value={volume} onInput={(e) => setVolume(e.currentTarget.value)} />
      </div>
      <IconButton label={t('player.fullVolume')} onClick={() => setVolume(1)}>
        <VolumeFullIcon size={'16px'} />
      </IconButton>
    </div>
  );
};

const PlayerControls = (props: PlayerControlsProps) => {
  const { currentSong, currentTime, isPlaying, seek, play, pause, setCurrentTime, setPlaying, addPlayStatusListener, addTimeChangeListener } = props;

  useMediaSessionActions({ play, pause, previousSong: props.previousSong, nextSong: props.nextSong });

  useAudioListener(addPlayStatusListener, (playing) => {
    if (isPlaying !== playing) setPlaying(playing);
  });

  useAudioListener(addTimeChangeListener, (time) => {
    if (round(time) !== round(currentTime)) setCurrentTime(time);
  });

  useUpdateEffect(() => seek(currentTime), [currentTime]);
  useUpdateEffect(() => (isPlaying ? play() : pause()), [isPlaying]);
  useUpdateEffect(() => {
    if (isPlaying) play();
  }, [currentSong]);

  return (
    <div className={style.controls}>
      <TrackDetails currentSong={currentSong} streamTitle={props.streamTitle} streamArt={props.streamArt} />
      <div className={style.center}>
        <TransportButtons {...props} />
        {currentSong && radioUuidOf(currentSong.path) ? (
          <LiveRow isPlaying={isPlaying} currentTime={currentTime} />
        ) : (
          <SeekBar currentSong={currentSong} currentTime={currentTime} setCurrentTime={setCurrentTime} />
        )}
      </div>
      <div className={style.right}>
        <VolumeControls volume={props.volume} setVolume={props.setVolume} openEqualizer={props.openEqualizer} />
      </div>
    </div>
  );
};

export default PlayerControls;
