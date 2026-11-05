import { session } from 'electron';
import playlistParser from 'playlist-parser';
import { fetchOk } from '../services/http';
import { getMainWindow } from '../windows/getMainWindow';
import type { ListenerContext } from './listenerContext';

const sendPlaylist = async (url: string, { windows }: ListenerContext) => {
  const response = await fetchOk(url);

  const playlist = playlistParser.PLS.parse(await response.text());
  getMainWindow(windows).webContents.send('CLICKED_URL', { playlist, url });
};

/** A downloaded playlist is not saved, its tracks are sent to the renderer to play */
const registerPlaylistDownload = (context: ListenerContext) => {
  session.defaultSession.on('will-download', (event, item) => {
    event.preventDefault();
    sendPlaylist(item.getURL(), context).catch((error) => console.error(error));
  });
};

export default registerPlaylistDownload;
