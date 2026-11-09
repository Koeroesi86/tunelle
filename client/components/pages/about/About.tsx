import { useState } from 'react';
import classNames from 'classnames';
import type { UpdateState } from '@shared/types/update';
import Confirm from '../../ui/confirm';
import Switch from '../../ui/switch/Switch';
import { useTranslation } from '../../../i18n';
import Wordmark from '../../layout/wordmark/Wordmark';
import appIcon from '../../../../assets/icon.svg';
import style from './About.scss';

interface AboutProps {
  update: UpdateState | null;
  isPlaying: boolean;
  check: () => void;
  install: () => void;
  confirmMetered: () => void;
  cancelMetered: () => void;
  setAllowMetered: (enabled: boolean) => void;
  setAutomatic: (enabled: boolean) => void;
  openReleases: () => void;
  openFfmpegNotice: () => void;
}

/** The installed version, and where the app updates itself the check for a new one; elsewhere the reason it does not */
const About = ({
  update,
  isPlaying,
  check,
  install,
  confirmMetered,
  cancelMetered,
  setAllowMetered,
  setAutomatic,
  openReleases,
  openFfmpegNotice,
}: AboutProps) => {
  const { t, language } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  if (!update) return null;

  const { status, unavailable } = update;
  const action = (label: string, onClick: () => void) => (
    <button className={style.action} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <section className={classNames(style.about, style.wide)} aria-label={t('about.title')}>
      <div className={style.identity}>
        <img className={style.icon} src={appIcon} alt="" />
        <Wordmark className={style.wordmark} />
      </div>
      <div className={style.version}>{t('about.version', { version: update.version })}</div>
      <div className={style.details}>{t('about.details', { electron: update.electron, chrome: update.chrome })}</div>
      {unavailable && <div className={style.status}>{t(`about.unavailable.${unavailable}`)}</div>}
      {unavailable && unavailable !== 'development' && action(t('about.releases'), openReleases)}
      {!unavailable && status.kind === 'checking' && <div className={style.status}>{t('about.checking')}</div>}
      {!unavailable && status.kind === 'downloading' && (
        <div className={style.status}>{t('about.downloading', { version: status.version, percent: status.percent })}</div>
      )}
      {!unavailable && status.kind === 'upToDate' && (
        <div className={style.status}>{t('about.upToDate', { time: new Intl.DateTimeFormat(language, { timeStyle: 'short' }).format(status.checkedAt) })}</div>
      )}
      {!unavailable && status.kind === 'failed' && <div className={style.status}>{t('about.failed', { message: status.message })}</div>}
      {!unavailable && status.kind === 'ready' && <div className={style.status}>{t('about.ready', { version: status.version })}</div>}
      {!unavailable && ['idle', 'upToDate'].includes(status.kind) && action(t('about.check'), check)}
      {!unavailable && status.kind === 'failed' && action(t('about.retry'), check)}
      {!unavailable && status.kind === 'ready' && action(t('about.restart'), () => (isPlaying ? setConfirming(true) : install()))}
      {!unavailable && (
        <div className={style.automatic}>
          <div>
            <div className={style.automaticTitle}>{t('about.automatic')}</div>
            <div className={style.status}>{update.automatic ? t('about.automatic.on') : t('about.automatic.off')}</div>
          </div>
          <Switch checked={update.automatic} label={t('about.automatic')} onChange={setAutomatic} />
        </div>
      )}
      {!unavailable && (
        <div className={style.automatic}>
          <div>
            <div className={style.automaticTitle}>{t('about.allowMetered')}</div>
            <div className={style.status}>{update.allowMetered ? t('about.allowMetered.on') : t('about.allowMetered.off')}</div>
          </div>
          <Switch checked={update.allowMetered} label={t('about.allowMetered')} onChange={setAllowMetered} />
        </div>
      )}
      {!unavailable && status.kind === 'metered' && (
        <Confirm message={t('about.metered')} confirmLabel={t('about.metered.continue')} confirm={confirmMetered} cancel={cancelMetered} />
      )}
      {unavailable !== 'development' && (
        <div className={style.automatic}>
          <div className={style.status}>{t('about.ffmpeg')}</div>
          {action(t('about.ffmpeg.notice'), openFfmpegNotice)}
        </div>
      )}
      {confirming && (
        <Confirm
          message={t('about.restartPlaying')}
          confirmLabel={t('about.restart')}
          confirm={() => {
            setConfirming(false);
            install();
          }}
          cancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
};

export default About;
