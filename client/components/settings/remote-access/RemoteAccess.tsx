import { useState } from 'react';
import type { FormEvent } from 'react';
import style from './RemoteAccess.scss';
import { useTranslation } from '../../../i18n';
import Switch from '../../ui/switch/Switch';
import type { Control } from '@shared/constants/remote-controls';
import { MAX_LISTENERS } from '@shared/constants/remote-limits';
import type { RemoteHostState } from '@shared/schemas/remote-host';

type Action = 'approve' | 'deny' | 'revoke' | 'block' | 'disconnect';

interface RemoteAccessProps {
  state: RemoteHostState | undefined;
  setEnabled: (enabled: boolean) => void;
  update: (change: { name?: string; loopbackOnly?: boolean; port?: number; maxListeners?: number }) => void;
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
        {!device.blocked && (
          <button type="button" className={style.action} onClick={() => decide(device.id, 'disconnect')}>
            {t('remote.disconnect')}
          </button>
        )}
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

/** The name other devices see; it is sent when the field is left or Enter is pressed, as a change restarts the host, and not when it is empty or the same */
const NameField = ({ name, update }: { name: string } & Pick<RemoteAccessProps, 'update'>) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(name);
  const commit = (event?: FormEvent) => {
    event?.preventDefault();
    const next = draft.trim();
    if (next === '' || next === name) return setDraft(name);
    update({ name: next });
  };

  return (
    <form className={style.field} onSubmit={commit}>
      <input
        value={draft}
        maxLength={60}
        aria-label={t('remote.name')}
        placeholder={t('remote.name')}
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit()}
      />
    </form>
  );
};

/** A whole number setting; it is sent when the field is left or Enter is pressed, as a change restarts the host, and not when it is out of range or the same */
const NumberField = ({
  value,
  label,
  min,
  max,
  onCommit,
}: {
  value: number | undefined;
  label: string;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) => {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  const commit = (event?: FormEvent) => {
    event?.preventDefault();
    const next = Number(draft);
    if (!Number.isInteger(next) || next < min || next > max || next === value) return setDraft(value === undefined ? '' : String(value));
    onCommit(next);
  };

  return (
    <form className={style.field} onSubmit={commit}>
      <input
        value={draft}
        inputMode="numeric"
        aria-label={label}
        placeholder={label}
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit()}
      />
    </form>
  );
};

/** Turns the host mode on and off, and answers the devices that ask to listen. Nothing listens until the switch is on. See docs/app/remote-access-host.md */
const RemoteAccess = ({ state, setEnabled, update, decide, setControls }: RemoteAccessProps) => {
  const { t } = useTranslation();

  if (!state) return null;

  return (
    <section className={style.remoteAccess}>
      <div className={style.sectionTitle}>
        {t('remote.title')}
        <Switch checked={state.enabled} label={t('remote.title')} onChange={setEnabled} />
      </div>
      <div className={style.hint}>{t('remote.hint')}</div>
      <NameField key={state.name} name={state.name} update={update} />
      <label htmlFor="remote-loopback-only" className={style.control}>
        <input id="remote-loopback-only" type="checkbox" checked={state.loopbackOnly} onChange={() => update({ loopbackOnly: !state.loopbackOnly })} />
        {t('remote.loopbackOnly')}
      </label>
      <NumberField
        key={`max-${state.maxListeners}`}
        value={state.maxListeners}
        label={t('remote.maxListeners')}
        min={1}
        max={MAX_LISTENERS}
        onCommit={(maxListeners) => update({ maxListeners })}
      />
      <NumberField key={`port-${state.port}`} value={state.port} label={t('remote.fixedPort')} min={1024} max={65535} onCommit={(port) => update({ port })} />
      {state.error && <div className={style.error}>{t('remote.error', { error: state.error })}</div>}
      {state.running && state.port && <div className={style.hint}>{t('remote.port', { port: state.port })}</div>}
      {state.running && !state.loopbackOnly && <div className={style.hint}>{t('remote.network')}</div>}
      {state.running && !state.loopbackOnly && state.devices.length === 0 && <div className={style.hint}>{t('remote.noListeners')}</div>}
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
