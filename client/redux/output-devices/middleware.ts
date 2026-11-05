import type { OutputDevice } from '../../audio/output-device';
import { actionMiddleware, onAction } from '../on-action';

/** Chromium hides the devices until the page may see them: it gives one placeholder with no id, which is the system default and not a device to pick */
const isPickable = ({ kind, deviceId }: MediaDeviceInfo) =>
  kind === 'audiooutput' && deviceId !== '' && deviceId !== 'default' && deviceId !== 'communications';

const listOutputDevices = async (): Promise<OutputDevice[]> => {
  const devices = (await navigator.mediaDevices?.enumerateDevices()) ?? [];
  return devices.filter(isPickable).map(({ deviceId, label }) => ({ id: deviceId, label }));
};

/** Keeps the output devices that are there in the state, up to date as they are plugged and unplugged, from the start of the app on */
const middleware = actionMiddleware((store) => [
  onAction('APP_INIT', () => {
    const refresh = () =>
      listOutputDevices()
        .then((devices) => store.dispatch({ type: 'OUTPUT_DEVICES_LOADED', payload: { devices } }))
        .catch((err) => console.error(err));
    refresh();
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
  }),
]);

export default middleware;
