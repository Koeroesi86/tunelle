import { ipcMain } from 'electron';
import { errorMessage } from '../../shared/utils/error-message';
import type { ListenerContext } from './listenerContext';
import { toRadioQuery } from '../services/radioBrowser';

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
        .catch((error) => console.error(error))
    );
  });

  ipcMain.on('RADIO_TAGS', (event) => {
    radio
      .getTags()
      .then((tags) => event.sender.send('RADIO_TAGS_LOADED', { tags }))
      .catch((error) => console.error(error));
  });
};

export default registerRadioListeners;
