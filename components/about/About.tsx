import { useState } from 'react';
import classNames from 'classnames';
import type { UpdateState } from '../../types/update';
import Confirm from '../confirm';
import Switch from '../switch/Switch';
import { useTranslation } from '../../client/i18n';
import appIcon from '../../assets/icon.svg';
import style from './About.scss';

interface AboutProps {
  update: UpdateState | null;
  isPlaying: boolean;
  check: () => void;
  install: () => void;
  setAutomatic: (enabled: boolean) => void;
  openReleases: () => void;
}

/** The installed version, and where the app updates itself the check for a new one; elsewhere the reason it does not */
const About = ({ update, isPlaying, check, install, setAutomatic, openReleases }: AboutProps) => {
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
        <div>
          <div className={style.version}>{t('about.version', { version: update.version })}</div>
          <div className={style.details}>{t('about.details', { electron: update.electron, chrome: update.chrome })}</div>
        </div>
      </div>
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
