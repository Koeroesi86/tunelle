import style from './ArtistPhotos.scss';
import { useTranslation } from '../../../i18n';
import Switch from '../../ui/switch/Switch';

interface ArtistPhotosProps {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

/** Tells where the photos of the artists come from and what that sends, and turns the lookup on and off */
const ArtistPhotos = ({ enabled, setEnabled }: ArtistPhotosProps) => {
  const { t } = useTranslation();

  return (
    <section className={style.artistPhotos}>
      <div className={style.sectionTitle}>
        {t('artistPhotos.title')}
        <Switch checked={enabled} label={t('artistPhotos.title')} onChange={setEnabled} />
      </div>
      <div className={style.description}>{enabled ? t('artistPhotos.on') : t('artistPhotos.off')}</div>
    </section>
  );
};

export default ArtistPhotos;
