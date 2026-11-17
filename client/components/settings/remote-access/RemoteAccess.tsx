import style from './RemoteAccess.scss';
import { useTranslation } from '../../../i18n';
import Switch from '../../ui/switch/Switch';
import type { Control } from '@shared/constants/remote-controls';
import type { RemoteHostState } from '@shared/schemas/remote-host';

type Action = 'approve' | 'deny' | 'revoke' | 'block';

interface RemoteAccessProps {
  state: RemoteHostState | undefined;
  setEnabled: (enabled: boolean) => void;
  decide: (deviceId: string, action: Action) => void;
  setControls: (deviceId: string, controls: Control[]) => void;
}

// queue is a control the host can grant, but no command exists for it yet (electron/remote/control-command.ts)
const listed = ['playPause', 'skip', 'seek', 'volume'] as const;

const toggled = (controls: Control[], control: Control) => (controls.includes(control) ? controls.filter((item) => item !== control) : [...controls, control]);

const Device = ({ device, decide, setControls }: { device: RemoteHostState['devices'][number] } & Pick<RemoteAccessProps, 'decide' | 'setControls'>) => {
  const { t } = useTranslation();

  return (
    <li className={style.row}>
      <div className={style.rowHeader}>
        <span className={style.name}>{device.name}</span>
        {device.blocked && <span className={style.badge}>{t('remote.blocked')}</span>}
        <button type="button" className={style.action} onClick={() => decide(device.id, 'revoke')}>
          {t(device.blocked ? 'remote.unblock' : 'remote.revoke')}
        </button>
        {!device.blocked && (
          <button type="button" className={style.action} onClick={() => decide(device.id, 'block')}>
            {t('remote.block')}
          </button>
        )}
      </div>
      {!device.blocked && (
        <div className={style.controls} role="group" aria-label={t('remote.controlsFor', { name: device.name })}>
          {listed.map((control) => (
            <label key={control} htmlFor={`${device.id}-${control}`} className={style.control}>
              <input
                id={`${device.id}-${control}`}
                type="checkbox"
                checked={device.controls.includes(control)}
                onChange={() => setControls(device.id, toggled(device.controls, control))}
              />
              {t(`remote.control.${control}`)}
            </label>
          ))}
        </div>
      )}
    </li>
  );
};

const Pending = ({ request, decide }: { request: RemoteHostState['pending'][number] } & Pick<RemoteAccessProps, 'decide'>) => {
  const { t } = useTranslation();

  return (
    <li className={style.row}>
      <div className={style.rowHeader}>
        <span className={style.name}>{request.deviceName}</span>
        <button type="button" className={style.action} onClick={() => decide(request.deviceId, 'approve')}>
          {t('remote.approve')}
        </button>
        <button type="button" className={style.action} onClick={() => decide(request.deviceId, 'deny')}>
          {t('remote.deny')}
        </button>
      </div>
      {request.note && <div className={style.hint}>{request.note}</div>}
    </li>
  );
};

/** Turns the host mode on and off, and answers the devices that ask to listen. Nothing listens until the switch is on. See docs/app/remote-access-discovery.md */
const RemoteAccess = ({ state, setEnabled, decide, setControls }: RemoteAccessProps) => {
  const { t } = useTranslation();

  if (!state) return null;

  return (
    <section className={style.remoteAccess}>
      <div className={style.sectionTitle}>
        {t('remote.title')}
        <Switch checked={state.enabled} label={t('remote.title')} onChange={setEnabled} />
      </div>
      <div className={style.hint}>{t('remote.hint')}</div>
      {state.error && <div className={style.error}>{t('remote.error', { error: state.error })}</div>}
      {state.running && state.code && <div className={style.hint}>{t('remote.code', { code: state.code })}</div>}
      {state.pending.length > 0 && (
        <ul className={style.list} aria-label={t('remote.pending')}>
          {state.pending.map((request) => (
            <Pending key={request.deviceId} request={request} decide={decide} />
          ))}
        </ul>
      )}
      {state.devices.length > 0 && (
        <ul className={style.list} aria-label={t('remote.devices')}>
          {state.devices.map((device) => (
            <Device key={device.id} device={device} decide={decide} setControls={setControls} />
          ))}
        </ul>
      )}
    </section>
  );
};

export default RemoteAccess;
