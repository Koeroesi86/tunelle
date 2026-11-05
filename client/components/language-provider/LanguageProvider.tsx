import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { TranslationContext } from '../../i18n';
import { getTranslator } from '@shared/locales';

interface LanguageProviderProps {
  /** The language picked in the settings, undefined follows the system */
  language?: string;
  children: ReactNode;
}

/** Selects the language of the text for everything below: the picked one, the system language of the browser, English */
const LanguageProvider = ({ language, children }: LanguageProviderProps) => {
  const translator = useMemo(() => getTranslator(language, navigator.languages), [language]);

  useEffect(() => {
    document.documentElement.lang = translator.language;
  }, [translator.language]);

  return <TranslationContext.Provider value={translator}>{children}</TranslationContext.Provider>;
};

export default LanguageProvider;
