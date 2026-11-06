import { app, ipcMain } from 'electron';
import type { IpcMainEvent } from 'electron';
import { getMainWindow } from '../windows/get-main-window';
import { sendIfAlive } from '../utils/send-if-alive';
import { coverFolder, createCoverFiles } from '../services/mpris-cover';
import { idleState, startMpris } from '../services/mpris';
import type { MprisCommand, MprisService, MprisState } from '../services/mpris';
import type { ListenerContext } from './listener-context';

interface CoverPayload {
  bytes: Uint8Array;
  type: string;
}

const isCover = (payload: unknown): payload is CoverPayload =>
  typeof payload === 'object' &&
  payload !== null &&
  'bytes' in payload &&
  payload.bytes instanceof Uint8Array &&
  'type' in payload &&
  typeof payload.type === 'string';

/** Shows the player in the media controls of the desktop (Linux): its own MPRIS service, fed by the page. See docs/app/mpris.md */
const registerMprisListeners = ({ windows }: ListenerContext) => {
  if (process.platform !== 'linux') return;

  const covers = createCoverFiles(coverFolder(process.env.XDG_RUNTIME_DIR, process.env.FLATPAK_ID));
  let service: MprisService | undefined;
  let state: MprisState = idleState;
  let coverUrl: string | undefined;

  const push = () => service?.update({ ...state, track: state.track && { ...state.track, coverUrl } });

  const onCommand = (command: MprisCommand) => {
    const main = getMainWindow(windows);
    if (command.name === 'quit') return app.quit();
    if (command.name !== 'raise') return sendIfAlive(main.webContents, 'MPRIS_COMMAND', command);

    main.show();
    main.focus();
  };

  startMpris(app.getName(), process.env.FLATPAK_ID, onCommand).then(
    (started) => {
      service = started;
      push();
    },
    (error: unknown) => console.error('The media controls of the desktop are not available', error)
  );

  ipcMain.on('MPRIS_STATE', (_event: IpcMainEvent, payload: MprisState) => {
    state = payload;
    push();
  });

  ipcMain.on('MPRIS_COVER', (_event: IpcMainEvent, payload: unknown) => {
    if (!isCover(payload)) {
      coverUrl = undefined;
      covers.clear().catch(() => undefined);
      return push();
    }

    covers.write(payload.bytes, payload.type).then(
      (url) => {
        coverUrl = url;
        push();
      },
      (error: unknown) => console.error('The cover for the media controls was not written', error)
    );
  });

  app.on('will-quit', () => {
    service?.close();
    covers.clear().catch(() => undefined);
  });
};

export default registerMprisListeners;
