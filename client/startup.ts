import { splashFadeMilliseconds } from './components/layout/loading-splash/LoadingSplash';

interface StartupApi {
  on: (channel: string, listener: () => void) => void;
  send: (channel: string) => void;
}

/** Runs `start` once, when the main process says the app has started; it is asked too, as the message may have been sent before the page loaded */
export const onAppStarted = (api: StartupApi, start: () => void) => {
  let started = false;
  const startOnce = () => {
    if (started) return;

    started = true;
    start();
  };

  api.on('APP_STARTED', startOnce);
  api.send('STARTUP_STATUS');
};

/** Fades the splash out once the player has its first page, and takes it out of the page */
export const hideSplash = () => {
  const splash = document.getElementById('splash');
  if (!splash) return;

  splash.style.opacity = '0';
  splash.style.pointerEvents = 'none';
  setTimeout(() => splash.remove(), splashFadeMilliseconds);
};
