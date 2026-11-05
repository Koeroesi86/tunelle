import style from './LauncherIntegration.scss';
import { useTranslation } from '../../../i18n';
import Switch from '../../ui/switch/Switch';

interface LauncherIntegrationProps {
  available: boolean;
  enabled: boolean;
  external: boolean;
  setEnabled: (enabled: boolean) => void;
}

/** Adds the AppImage to the application menu of the desktop and removes it again, an AppImage has no install step of its own */
const LauncherIntegration = ({ available, enabled, external, setEnabled }: LauncherIntegrationProps) => {
  const { t } = useTranslation();

  if (!available) return null;

  return (
    <section className={style.launcherIntegration}>
      <div className={style.sectionTitle}>
        {t('launcher.title')}
        <Switch checked={enabled || external} disabled={external} label={t('launcher.title')} onChange={setEnabled} />
      </div>
      <div className={style.hint}>{t(external ? 'launcher.external' : 'launcher.hint')}</div>
    </section>
  );
};

export default LauncherIntegration;
