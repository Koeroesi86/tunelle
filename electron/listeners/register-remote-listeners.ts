import { hostname } from 'node:os';
import { app, ipcMain } from 'electron';
import { serveTrack } from '../protocols/serve-track';
import { advertisementId, createHostController } from '../remote/host-controller';
import type { HostState } from '../remote/host-controller';
import { deviceNameOf } from '../remote/device-name';
import { deviceControlsSchema, deviceDecisionSchema, hostChangeSchema } from '../remote/host-requests';
import { createHostStore } from '../remote/host-store';
import { createListenerController } from '../remote/listener-controller';
import { confirmSchema, connectSchema } from '../remote/listener-requests';
import { createListenerStore } from '../remote/listener-store';
import { createNearby } from '../remote/nearby';
import { nearbyRequestSchema } from '../remote/nearby-requests';
import { provideRemoteAudio } from '../remote/remote-audio';
import { logError } from '../utils/log-error';
import { parsePayload } from '../utils/parse-payload';
import { sendIfAlive } from '../utils/send-if-alive';
import type { ListenerContext } from './listener-context';

/** The host mode of the app (what the page asks: settings, the decision on a device, and the now playing it sends) and the listener side (pairing with a host). See docs/app/remote-access-discovery.md */
const registerRemoteListeners = ({ database, windows }: ListenerContext) => {
  const host = createHostController(
    createHostStore(global._appDataPath),
    (state: HostState) => windows.main && sendIfAlive(windows.main.webContents, 'REMOTE_HOST_STATE', state),
    (command) => windows.main && sendIfAlive(windows.main.webContents, 'REMOTE_CONTROL', command),
    (trackPath, request) => serveTrack(database, trackPath, request),
    app.getVersion()
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

  const listener = createListenerController(
    createListenerStore(global._appDataPath),
    deviceNameOf(hostname()),
    (state) => windows.main && sendIfAlive(windows.main.webContents, 'REMOTE_LISTENER_STATE', state)
  );
  provideRemoteAudio(listener.audio);
  // a listener without a host it was approved by contacts nobody
  listener.start().catch(logError);

  ipcMain.on('GET_REMOTE_LISTENER', (event) => sendIfAlive(event.sender, 'REMOTE_LISTENER_STATE', listener.state()));
  ipcMain.on('CONNECT_REMOTE_HOST', (_event, payload: unknown) => {
    const target = parsePayload(connectSchema, payload);
    if (target) listener.connect(target).catch(logError);
  });
  ipcMain.on('CONFIRM_REMOTE_HOST', (_event, payload: unknown) => {
    const request = parsePayload(confirmSchema, payload);
    if (request) listener.confirm(request.note).catch(logError);
  });
  ipcMain.on('LEAVE_REMOTE_HOST', () => listener.leave().catch(logError));

  const nearby = createNearby(
    (hosts) => windows.main && sendIfAlive(windows.main.webContents, 'REMOTE_NEARBY', hosts),
    () => {
      const { code } = host.state();
      return code ? advertisementId(code) : undefined;
    }
  );
  ipcMain.on('BROWSE_REMOTE_NEARBY', (_event, payload: unknown) => {
    const request = parsePayload(nearbyRequestSchema, payload);
    if (request) (request.active ? nearby.start() : nearby.stop()).catch(logError);
  });
};

export default registerRemoteListeners;
