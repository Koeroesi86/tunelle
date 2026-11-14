import { powerSavingModeSchema } from '@shared/schemas/settings';
import type { PowerSavingMode } from '@shared/schemas/settings';
import { useTranslation } from '../../../i18n';
import style from './PowerSaving.scss';

interface PowerSavingProps {
  mode: PowerSavingMode;
  /** Whether the background work is lowered right now */
  saving: boolean;
  setMode: (mode: PowerSavingMode) => void;
}

/** Picks when the background work is lowered: on battery, always or never */
const PowerSaving = ({ mode, saving, setMode }: PowerSavingProps) => {
  const { t } = useTranslation();

  return (
    <section className={style.powerSaving}>
      <div className={style.sectionTitle}>{t('powerSaving.title')}</div>
      <select
        className={style.select}
        aria-label={t('powerSaving.title')}
        value={mode}
        onChange={(event) => setMode(powerSavingModeSchema.catch('auto').parse(event.target.value))}
      >
        {powerSavingModeSchema.options.map((option) => (
          <option key={option} value={option}>
            {t(`powerSaving.${option}`)}
          </option>
        ))}
      </select>
      <div className={style.description}>{t('powerSaving.description')}</div>
      <div className={style.description} role="status">
        {saving ? t('powerSaving.active') : t('powerSaving.inactive')}
      </div>
    </section>
  );
};

export default PowerSaving;
