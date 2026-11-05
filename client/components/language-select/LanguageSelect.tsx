import { useTranslation } from '../../i18n';
import { getLanguageName, supportedLanguages } from '../../../locales';
import style from './LanguageSelect.scss';

interface LanguageSelectProps {
  /** The language picked in the settings, undefined follows the system */
  language?: string;
  setLanguage: (language: string | undefined) => void;
}

const LanguageSelect = ({ language, setLanguage }: LanguageSelectProps) => {
  const { t } = useTranslation();

  return (
    <section className={style.languageSelect}>
      <div className={style.sectionTitle}>{t('language.title')}</div>
      <select
        className={style.select}
        aria-label={t('language.title')}
        value={language ?? ''}
        onChange={(event) => setLanguage(event.target.value || undefined)}
      >
        <option value="">{t('language.system')}</option>
        {supportedLanguages.map((supported) => (
          <option key={supported} value={supported}>
            {getLanguageName(supported)}
          </option>
        ))}
      </select>
    </section>
  );
};

export default LanguageSelect;
