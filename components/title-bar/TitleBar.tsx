import type { Track } from '@shared/types/library';
import { toNowPlaying } from '../../client/utils/now-playing';
import { useTranslation } from '../../client/i18n';
import appIcon from '../../assets/icon.svg';
import style from './TitleBar.scss';
import AudioSpectrum from '../audio-spectrum';
import WindowControls from '../window-controls';
import Wordmark from '../wordmark/Wordmark';
import CoverFade from '../cover-fade';

interface TitleBarProps {
  currentSong?: Track | null;
  streamTitle?: string | null;
  streamArt?: string | null;
  openNowPlaying?: () => void;
}

/** The bar across the top of the window: the app, the track that plays in the middle, and the window buttons; the empty part of it drags the window */
function TitleBar({ currentSong = null, streamTitle = null, streamArt = null, openNowPlaying = () => {} }: TitleBarProps) {
  const { t } = useTranslation();
  const shown = currentSong ? toNowPlaying(currentSong, streamTitle, streamArt) : undefined;

  return (
    <div className={style.titleBar}>
      <div className={style.title}>
        <img className={style.icon} src={appIcon} alt="" />
        <Wordmark className={style.wordmark} />
      </div>
      {shown ? (
        <button type="button" className={style.track} title={t('nowPlaying.title')} onClick={openNowPlaying}>
          <CoverFade className={style.cover} src={shown.cover} />
          <span className={style.name}>{shown.track.title}</span>
          {shown.track.artist && <span className={style.artist}>{shown.track.artist}</span>}
          <span className={style.spectrum}>
            <AudioSpectrum width={22} height={12} capHeight={0} meterCount={6} meterWidth={2} gap={2} />
          </span>
        </button>
      ) : (
        <span />
      )}
      <WindowControls />
    </div>
  );
}

export default TitleBar;
