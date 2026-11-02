import { useEffect, useState } from 'react';
import type { OutputDevice } from '../audio/output-device';

/** Chromium hides the devices until the page may see them: it gives one placeholder with no id, which is the system default and not a device to pick */
const isPickable = ({ kind, deviceId }: MediaDeviceInfo) =>
  kind === 'audiooutput' && deviceId !== '' && deviceId !== 'default' && deviceId !== 'communications';

const listOutputDevices = async (): Promise<OutputDevice[]> => {
  const devices = (await navigator.mediaDevices?.enumerateDevices()) ?? [];
  return devices.filter(isPickable).map(({ deviceId, label }) => ({ id: deviceId, label }));
};

/** The output devices that are there, kept up to date as they are plugged and unplugged */
export const useOutputDevices = () => {
  const [devices, setDevices] = useState<OutputDevice[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      listOutputDevices()
        .then((list) => alive && setDevices(list))
        .catch((err) => console.error(err));
    refresh();
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => {
      alive = false;
      navigator.mediaDevices?.removeEventListener('devicechange', refresh);
    };
  }, []);

  return devices;
};
