import { useTranslation } from '../../../i18n';
import Switch from '../../ui/switch/Switch';
import style from './WindowBlur.scss';

interface WindowBlurProps {
  available: boolean;
  enabled: boolean;
  toggle: () => void;
}

/** Lets the panels be translucent where the desktop blurs the window (Blur my Shell on GNOME), the app cannot detect that itself */
const WindowBlur = ({ available, enabled, toggle }: WindowBlurProps) => {
  const { t } = useTranslation();

  if (!available) return null;

  return (
    <section className={style.windowBlur}>
      <div className={style.sectionTitle}>
        {t('blur.title')}
        <Switch checked={enabled} label={t('blur.title')} onChange={toggle} />
      </div>
      <div className={style.hint}>{t('blur.hint')}</div>
    </section>
  );
};

export default WindowBlur;
