import { useTranslation } from '../../../i18n';
import Switch from '../../ui/switch/Switch';
import style from './ReduceMotion.scss';

interface ReduceMotionProps {
  enabled: boolean;
  toggle: () => void;
}

/** Stops the animations and the spectrum, besides when the system setting for reduced motion already does */
const ReduceMotion = ({ enabled, toggle }: ReduceMotionProps) => {
  const { t } = useTranslation();

  return (
    <section className={style.reduceMotion}>
      <div className={style.sectionTitle}>
        {t('motion.title')}
        <Switch checked={enabled} label={t('motion.title')} onChange={toggle} />
      </div>
      <div className={style.hint}>{t('motion.hint')}</div>
    </section>
  );
};

export default ReduceMotion;
