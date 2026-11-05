import style from './WatchFolders.scss';
import { useTranslation } from '../../i18n';
import Switch from '../switch/Switch';

interface WatchFoldersProps {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

/** Turns the watching of the library folders on and off, for libraries on slow drives */
const WatchFolders = ({ enabled, setEnabled }: WatchFoldersProps) => {
  const { t } = useTranslation();

  return (
    <section className={style.watchFolders}>
      <div className={style.sectionTitle}>
        {t('watchFolders.title')}
        <Switch checked={enabled} label={t('watchFolders.title')} onChange={setEnabled} />
      </div>
      <div className={style.description}>{enabled ? t('watchFolders.on') : t('watchFolders.off')}</div>
    </section>
  );
};

export default WatchFolders;
