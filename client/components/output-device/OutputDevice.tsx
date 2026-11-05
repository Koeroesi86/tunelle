import { useTranslation } from '../../i18n';
import { resolveOutputId } from '../../audio/output-device';
import type { OutputDevice as Device } from '../../audio/output-device';
import style from './OutputDevice.scss';

interface OutputDeviceProps {
  /** The device picked in the settings, undefined follows the system default */
  device?: Device;
  /** The output devices that are there */
  devices: Device[];
  setDevice: (device: Device | undefined) => void;
}

/** Where the sound goes: the system default or one of the output devices, such as a DAC, headphones or speakers */
const OutputDevice = ({ device, devices, setDevice }: OutputDeviceProps) => {
  const { t } = useTranslation();
  const selected = resolveOutputId(device, devices);

  return (
    <section className={style.outputDevice}>
      <div className={style.sectionTitle}>{t('outputDevice.title')}</div>
      <select
        className={style.select}
        aria-label={t('outputDevice.title')}
        value={selected}
        onChange={(event) => setDevice(devices.find(({ id }) => id === event.target.value))}
      >
        <option value="">{t('outputDevice.system')}</option>
        {devices.map(({ id, label }, index) => (
          <option key={id} value={id}>
            {label || t('outputDevice.unnamed', { number: index + 1 })}
          </option>
        ))}
      </select>
      <div className={style.description}>{t(device && !selected ? 'outputDevice.missing' : 'outputDevice.hint')}</div>
    </section>
  );
};

export default OutputDevice;
