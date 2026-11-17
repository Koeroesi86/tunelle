import { ipcMain } from 'electron';
import { createHostController } from '../remote/host-controller';
import type { HostState } from '../remote/host-controller';
import { deviceControlsSchema, deviceDecisionSchema, hostChangeSchema } from '../remote/host-requests';
import { createHostStore } from '../remote/host-store';
import { logError } from '../utils/log-error';
import { parsePayload } from '../utils/parse-payload';
import { sendIfAlive } from '../utils/send-if-alive';
import type { ListenerContext } from './listener-context';

/** The host mode of the app: what the page asks (settings, the decision on a device) and the now playing it sends. See docs/app/remote-access-discovery.md */
const registerRemoteListeners = ({ windows }: ListenerContext) => {
  const host = createHostController(
    createHostStore(global._appDataPath),
    (state: HostState) => windows.main && sendIfAlive(windows.main.webContents, 'REMOTE_HOST_STATE', state),
    (command) => windows.main && sendIfAlive(windows.main.webContents, 'REMOTE_CONTROL', command)
  );

  // a host that is off opens no socket: start() only reads the settings, and listens when they say so
  host.start().catch(logError);

  ipcMain.on('GET_REMOTE_HOST', (event) => sendIfAlive(event.sender, 'REMOTE_HOST_STATE', host.state()));
  ipcMain.on('SET_REMOTE_HOST', (_event, payload: unknown) => {
    const change = parsePayload(hostChangeSchema, payload);
    if (change) host.update(change).catch(logError);
  });
  ipcMain.on('DECIDE_REMOTE_DEVICE', (_event, payload: unknown) => {
    const decision = parsePayload(deviceDecisionSchema, payload);
    if (decision) host.decide(decision.deviceId, decision.action).catch(logError);
  });
  ipcMain.on('SET_REMOTE_DEVICE_CONTROLS', (_event, payload: unknown) => {
    const request = parsePayload(deviceControlsSchema, payload);
    if (request) host.setControls(request.deviceId, request.controls).catch(logError);
  });
  ipcMain.on('REMOTE_STATE', (_event, payload: unknown) => host.setNowPlaying(payload));
};

export default registerRemoteListeners;
