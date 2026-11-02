/** An output device the listener picked: the id can change (a replugged USB device), so the name is kept to find it again */
export interface OutputDevice {
  id: string;
  label: string;
}

/** The id of the system default output, which is what the audio context uses without a choice */
const defaultOutputId = '';

export const restoreOutputDevice = (value: unknown): OutputDevice | undefined => {
  if (typeof value !== 'object' || value === null || !('id' in value) || !('label' in value)) return undefined;

  const { id, label } = value;
  return typeof id === 'string' && typeof label === 'string' && id !== defaultOutputId ? { id, label } : undefined;
};

/** The id to play on: the saved device by its id, else by its name; a device that is not there gives the default */
export const resolveOutputId = (saved: OutputDevice | undefined, devices: OutputDevice[]) =>
  [devices.find(({ id }) => id === saved?.id), devices.find(({ label }) => label !== '' && label === saved?.label)].find(Boolean)?.id ?? defaultOutputId;
