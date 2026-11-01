import style from './RadioSources.scss';
import { useTranslation } from '../../client/i18n';

/** Tells where the stations and their covers come from and what is sent to whom, as the Store and the sources ask for */
const RadioSources = () => {
  const { t } = useTranslation();

  return (
    <section className={style.radioSources}>
      <div className={style.sectionTitle}>{t('radioSources.title')}</div>
      <div className={style.description}>{t('radioSources.text')}</div>
    </section>
  );
};

export default RadioSources;
