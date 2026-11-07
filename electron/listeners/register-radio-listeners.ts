import { ipcMain } from 'electron';
import { errorMessage } from '@shared/utils/error-message';
import type { ListenerContext } from './listener-context';
import { toRadioQuery } from '../services/radio-browser';

/** A fetch that fails says only 'fetch failed', the reason (a reset connection, a name that does not resolve) is its cause */
const reasonOf = (error: unknown) =>
  error instanceof Error && error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : errorMessage(error);

const logUnavailable = (what: string) => (error: unknown) => console.warn(`The radio directory did not answer for the ${what}: ${reasonOf(error)}`);

const registerRadioListeners = ({ radio }: ListenerContext) => {
  ipcMain.on('RADIO_SEARCH', (event, payload: unknown) => {
    const query = toRadioQuery(payload);

    radio
      .searchStations(query)
      .then(({ stations, hasMore }) => event.sender.send('RADIO_STATIONS', { query, stations, hasMore }))
      .catch((error) => event.sender.send('RADIO_STATIONS', { query, stations: [], error: errorMessage(error) }));
  });

  // each list is loaded on its own, one that fails leaves its filter empty
  ipcMain.on('RADIO_OPTIONS', (event) => {
    (['countries', 'languages', 'codecs'] as const).forEach((kind) =>
      radio
        .getOptions(kind)
        .then((options) => event.sender.send('RADIO_OPTIONS_LOADED', { kind, options }))
        .catch(logUnavailable(`list of ${kind}`))
    );
  });

  ipcMain.on('RADIO_TAGS', (event) => {
    radio
      .getTags()
      .then((tags) => event.sender.send('RADIO_TAGS_LOADED', { tags }))
      .catch(logUnavailable('tags'));
  });
};

export default registerRadioListeners;
