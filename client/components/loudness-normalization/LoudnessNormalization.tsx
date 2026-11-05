import classNames from 'classnames';
import { normalizationModes } from '../../audio/loudness';
import type { NormalizationMode } from '../../audio/loudness';
import { useTranslation } from '../../i18n';
import style from './LoudnessNormalization.scss';

interface LoudnessNormalizationProps {
  mode: NormalizationMode;
  setMode: (mode: NormalizationMode) => void;
}

/** Whether the tracks play at the same loudness by their ReplayGain tags: off, per track or per album */
const LoudnessNormalization = ({ mode, setMode }: LoudnessNormalizationProps) => {
  const { t } = useTranslation();

  return (
    <section className={style.loudnessNormalization}>
      <div className={style.sectionTitle}>{t('normalization.title')}</div>
      <div className={style.modes} role="radiogroup" aria-label={t('normalization.title')}>
        {normalizationModes.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === mode}
            className={classNames(style.mode, { [style.selected]: option === mode })}
            onClick={() => setMode(option)}
          >
            {t(`normalization.${option}`)}
          </button>
        ))}
      </div>
      <div className={style.description}>{t(`normalization.${mode}Hint`)}</div>
    </section>
  );
};

export default LoudnessNormalization;
