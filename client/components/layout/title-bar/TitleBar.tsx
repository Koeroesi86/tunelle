import { MdMenu as MenuIcon } from 'react-icons/md';
import type { Track } from '@shared/types/library';
import { toNowPlaying } from '../../../domain/now-playing';
import { useTranslation } from '../../../i18n';
import appIcon from '../../../../assets/icon.svg';
import style from './TitleBar.scss';
import AudioSpectrum from '../audio-spectrum';
import QueueIndicator from '../queue-indicator';
import WindowControls from '../window-controls';
import Wordmark from '../wordmark/Wordmark';
import CoverFade from '../../ui/cover-fade';

interface TitleBarProps {
  currentSong?: Track | null;
  streamTitle?: string | null;
  streamArt?: string | null;
  openNowPlaying?: () => void;
  /** The button that opens the navigation drawer, which the compact size of the window has instead of a sidebar */
  onMenu?: () => void;
  menuOpen?: boolean;
}

/** The bar across the top of the window: the app, the track that plays in the middle, and the window buttons; the empty part of it drags the window */
function TitleBar({ currentSong = null, streamTitle = null, streamArt = null, openNowPlaying = () => {}, onMenu, menuOpen = false }: TitleBarProps) {
  const { t } = useTranslation();
  const shown = currentSong ? toNowPlaying(currentSong, streamTitle, streamArt) : undefined;

  return (
    <div className={style.titleBar}>
      <div className={style.title}>
        {onMenu && (
          <button type="button" className={style.menu} title={t('nav.menu')} aria-label={t('nav.menu')} aria-expanded={menuOpen} onClick={onMenu}>
            <MenuIcon size={'20px'} />
          </button>
        )}
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
      <div className={style.actions}>
        <QueueIndicator />
        <WindowControls />
      </div>
    </div>
  );
}

export default TitleBar;
