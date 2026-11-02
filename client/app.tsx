import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import PlayerHome from '../components/player-home';
import ThemeProvider from '../components/theme-provider';
import LanguageProvider from '../components/language-provider';
import { store } from './redux/store';

const mount = () => {
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

if (typeof document !== 'undefined') mount();
