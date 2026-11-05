import { createContext, useContext } from 'react';
import { getTranslator } from '@shared/locales';

/** English until a provider selects the language, so a component renders on its own */
export const TranslationContext = createContext(getTranslator(undefined, []));

export const useTranslation = () => useContext(TranslationContext);
