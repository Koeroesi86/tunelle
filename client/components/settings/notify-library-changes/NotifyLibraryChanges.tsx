import style from './NotifyLibraryChanges.scss';
import { useTranslation } from '../../../i18n';
import Switch from '../../ui/switch/Switch';

interface NotifyLibraryChangesProps {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

/** Turns the notification on and off that tells what a scan changed in the library while the window is in the background */
const NotifyLibraryChanges = ({ enabled, setEnabled }: NotifyLibraryChangesProps) => {
  const { t } = useTranslation();

  return (
    <section className={style.notifyLibraryChanges}>
      <div className={style.sectionTitle}>
        {t('notifyLibraryChanges.title')}
        <Switch checked={enabled} label={t('notifyLibraryChanges.title')} onChange={setEnabled} />
      </div>
      <div className={style.description}>{enabled ? t('notifyLibraryChanges.on') : t('notifyLibraryChanges.off')}</div>
    </section>
  );
};

export default NotifyLibraryChanges;
