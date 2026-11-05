import { useEffect, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ThemeSettings } from '../../types/theme';
import { accentTokens, resolveTheme } from '../../client/theme';
import { useCoverAccent } from '../../client/hooks/use-cover-accent';
import { autoAccent } from '../../client/constants/theme';
import './ThemeProvider.scss';

interface ThemeProviderProps {
  theme: ThemeSettings;
  /** The cover of what plays, the accent follows it in the automatic setting */
  cover?: string;
  children: ReactNode;
}

const darkQuery = '(prefers-color-scheme: dark)';

/** Whether the system is dark now, and again whenever it changes */
const useSystemDark = () => {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(darkQuery).matches);

  useEffect(() => {
    const query = window.matchMedia(darkQuery);
    const update = () => setSystemDark(query.matches);

    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return systemDark;
};

/** Puts the theme on the root element for the stylesheets (data-theme and the accent properties) and the canvases (the computed style), before the page is painted */
const ThemeProvider = ({ theme: { mode, accent: picked }, cover, children }: ThemeProviderProps) => {
  const resolved = resolveTheme(mode, useSystemDark());
  const fromCover = useCoverAccent(cover, picked === autoAccent);
  const accent = picked === autoAccent ? fromCover : picked;

  useLayoutEffect(() => {
    const root = document.documentElement;

    root.dataset.theme = resolved;
    Object.entries(accentTokens(accent, resolved)).forEach(([name, value]) => root.style.setProperty(name, value));
  }, [resolved, accent]);

  return children;
};

export default ThemeProvider;
