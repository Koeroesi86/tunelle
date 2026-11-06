import { useEffect } from 'react';
import type { LoudnessProgress } from '@shared/types/loudness';
import { useTranslation } from '../../../i18n';
import Switch from '../../ui/switch/Switch';
import style from './MeasureLoudness.scss';

interface MeasureLoudnessProps {
  enabled: boolean;
  status: LoudnessProgress | undefined;
  setEnabled: (enabled: boolean) => void;
  loadStatus: () => void;
  clear: () => void;
}

/** Turns the measurement of the loudness of the tracks without ReplayGain tags on and off, shows how far it is, and forgets what it measured */
const MeasureLoudness = ({ enabled, status, setEnabled, loadStatus, clear }: MeasureLoudnessProps) => {
  const { t } = useTranslation();
  const waiting = status ? status.total - status.measured - status.failed : 0;

  // when it opens, and when it is turned on or off: the library may have changed, and turning it on starts it again
  useEffect(() => {
    loadStatus();
  }, [enabled]);

  return (
    <section className={style.measureLoudness}>
      <div className={style.sectionTitle}>
        {t('measureLoudness.title')}
        <Switch checked={enabled} label={t('measureLoudness.title')} onChange={setEnabled} />
      </div>
      <div className={style.description}>{enabled ? t('measureLoudness.on') : t('measureLoudness.off')}</div>
      {status && status.total > 0 && (
        <div className={style.progress} role="status">
          <div className={style.bar} aria-hidden="true">
            <div className={style.fill} style={{ width: `${(100 * (status.measured + status.failed)) / status.total}%` }} />
          </div>
          <div>{waiting === 0 ? t('measureLoudness.done') : t('measureLoudness.progress', { count: status.total, measured: status.measured })}</div>
          {status.failed > 0 && <div>{t('measureLoudness.failed', { count: status.failed })}</div>}
        </div>
      )}
      <button type="button" className={style.clear} onClick={clear} disabled={!status || status.measured + status.failed === 0}>
        {t('measureLoudness.clear')}
      </button>
    </section>
  );
};

export default MeasureLoudness;
