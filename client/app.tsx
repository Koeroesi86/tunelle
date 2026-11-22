import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import PlayerHome from './containers/layout/player-home';
import ThemeProvider from './containers/layout/theme-provider';
import LanguageProvider from './containers/layout/language-provider';
import { createAppStore } from './redux/store';
import { setBackend } from './backend/backend';
import { createElectronBackend } from './backend/electron-backend';
import { ResolveUrl } from './hooks/use-resolve-url';
import { localUrl } from './services/local-url';
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
          <ResolveUrl.Provider value={localUrl}>
            <PlayerHome />
          </ResolveUrl.Provider>
        </LanguageProvider>
      </ThemeProvider>
    </Provider>
  );
};

// the splash in the page covers the window until the main process has the library open and answers
if (typeof document !== 'undefined') {
  const backend = createElectronBackend(window.electronAPI);
  setBackend(backend);
  onAppStarted(backend, mount);
}
