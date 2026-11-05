import classNames from 'classnames';
import type { ThemeMode, ThemeSettings } from '@shared/types/theme';
import { useTranslation } from '../../i18n';
import { accentPresets, defaultAccent } from '../../theme';
import style from './ThemeSelect.scss';
import { autoAccent } from '../../constants/theme';

interface ThemeSelectProps {
  theme: ThemeSettings;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: string | undefined) => void;
}

const modes: ThemeMode[] = ['system', 'light', 'dark'];

/** The mode (system, light or dark) and the accent colour of the app */
const ThemeSelect = ({ theme: { mode, accent }, setMode, setAccent }: ThemeSelectProps) => {
  const { t } = useTranslation();
  const automatic = accent === autoAccent;
  const current = automatic ? undefined : (accent ?? defaultAccent);

  return (
    <section className={style.themeSelect}>
      <div className={style.sectionTitle}>{t('theme.title')}</div>
      <div className={style.modes} role="radiogroup" aria-label={t('theme.mode')}>
        {modes.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === mode}
            className={classNames(style.mode, style[option], { [style.selected]: option === mode })}
            onClick={() => setMode(option)}
          >
            {t(`theme.${option}`)}
          </button>
        ))}
      </div>
      <div className={style.label}>{t('theme.accent')}</div>
      <div className={style.accents}>
        {accentPresets.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-label={t('theme.preset', { color: preset })}
            aria-pressed={preset === current}
            className={classNames(style.swatch, { [style.selected]: preset === current })}
            style={{ backgroundColor: preset }}
            onClick={() => setAccent(preset === defaultAccent ? undefined : preset)}
          />
        ))}
        <button
          type="button"
          aria-pressed={automatic}
          className={classNames(style.auto, { [style.selected]: automatic })}
          onClick={() => setAccent(autoAccent)}
        >
          {t('theme.auto')}
        </button>
        <input
          type="color"
          className={style.custom}
          aria-label={t('theme.custom')}
          value={current ?? defaultAccent}
          onChange={(event) => setAccent(event.target.value)}
        />
        <button type="button" className={style.reset} disabled={accent === undefined} onClick={() => setAccent(undefined)}>
          {t('theme.reset')}
        </button>
      </div>
    </section>
  );
};

export default ThemeSelect;
