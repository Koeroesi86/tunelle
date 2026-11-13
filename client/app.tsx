import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import PlayerHome from './components/layout/player-home';
import ThemeProvider from './components/layout/theme-provider';
import LanguageProvider from './components/layout/language-provider';
import { createAppStore } from './redux/store';
import { onAppStarted } from './startup';

const mount = () => {
  const store = createAppStore();
  store.dispatch({ type: 'APP_INIT' });

  const root = document.getElementById('root');
  if (!root) throw new Error('The page has no #root element');

  createRoot(root).render(
    <Provider store={store}>
      <ThemeProvider>
        <LanguageProvider>
          <PlayerHome />
        </LanguageProvider>
      </ThemeProvider>
    </Provider>
  );
};

// the splash in the page covers the window until the main process has the library open and answers
if (typeof document !== 'undefined') onAppStarted(window.electronAPI, mount);
