import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import style from './RemoteListener.scss';
import { useTranslation } from '../../../i18n';
import type { RemoteListenerState } from '@shared/schemas/remote-listener';
import type { NowPlaying as NowPlayingSnapshot } from '@shared/schemas/now-playing';
import { localUrl } from '../../../services/local-url';
import type { NearbyHost } from '@shared/schemas/remote-nearby';
import type { ControlCommand } from '@shared/schemas/remote-control';

interface RemoteListenerProps {
  state: RemoteListenerState | undefined;
  connect: (host: string, port: number) => void;
  confirm: (note: string) => void;
  leave: () => void;
  nearby: NearbyHost[];
  browse: (active: boolean) => void;
  control: (command: ControlCommand) => void;
  listenAlong: (snapshot: Exclude<NowPlayingSnapshot, { state: 'idle' }>) => void;
}

const isPort = (port: number) => Number.isInteger(port) && port >= 1024 && port <= 65535;

type HostStatus = 'unpaired' | 'pending' | 'approved' | 'denied';

/** What this app knows of a host in the list: only the host it is talking to has more than the first one */
const statusOf = (state: RemoteListenerState, { host, port }: NearbyHost): HostStatus => {
  if (state.target?.host !== host || state.target.port !== port) return 'unpaired';
  if (state.status === 'waiting') return 'pending';
  if (state.status === 'listening') return 'approved';
  return state.status === 'blocked' ? 'denied' : 'unpaired';
};

/** The Tunelles that announce themselves on the network, while the tile is shown. Picking one only starts the request: the host still shows a code to compare */
const Nearby = ({ state, nearby, browse, connect }: { state: RemoteListenerState } & Pick<RemoteListenerProps, 'nearby' | 'browse' | 'connect'>) => {
  const { t } = useTranslation();

  useEffect(() => {
    browse(true);
    return () => browse(false);
  }, []);

  // asks again at once: the socket is closed and opened, as the list is rebuilt from the answers
  const refresh = () => {
    browse(false);
    browse(true);
  };

  return (
    <div className={style.nearby}>
      <div className={style.hint}>{nearby.length > 0 ? t('remote.listen.nearby') : t('remote.listen.nearbyNone')}</div>
      {nearby.map((found) => {
        const status = statusOf(state, found);
        return (
          <div key={found.id} className={style.found}>
            <button
              type="button"
              className={style.action}
              title={`${found.host}:${found.port}`}
              disabled={status === 'pending' || status === 'approved'}
              onClick={() => connect(found.host, found.port)}
            >
              {t('remote.listen.connectTo', { name: found.name })}
            </button>
            <span className={style.status}>{t(`remote.listen.status.${status}`)}</span>
          </div>
        );
      })}
      <button type="button" className={style.action} onClick={refresh}>
        {t('remote.listen.refresh')}
      </button>
    </div>
  );
};

const Connect = ({ state, connect }: Pick<RemoteListenerProps, 'state' | 'connect'>) => {
  const { t } = useTranslation();
  const [host, setHost] = useState(state?.target?.host ?? '');
  const [port, setPort] = useState(state?.target ? String(state.target.port) : '');
  const busy = state?.status === 'contacting';
  const valid = host.trim() !== '' && isPort(Number(port));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid && !busy) connect(host.trim(), Number(port));
  };

  return (
    <form className={style.form} onSubmit={submit}>
      <input
        value={host}
        aria-label={t('remote.listen.host')}
        placeholder={t('remote.listen.host')}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setHost(event.target.value)}
      />
      <input
        className={style.port}
        value={port}
        inputMode="numeric"
        aria-label={t('remote.listen.port')}
        placeholder={t('remote.listen.port')}
        autoComplete="off"
        onChange={(event) => setPort(event.target.value)}
      />
      <button type="submit" className={style.action} disabled={!valid || busy}>
        {t('remote.listen.connect')}
      </button>
    </form>
  );
};

const Confirm = ({ code, confirm, leave }: { code: string | undefined } & Pick<RemoteListenerProps, 'confirm' | 'leave'>) => {
  const { t } = useTranslation();
  const [note, setNote] = useState('');

  return (
    <form
      className={style.form}
      onSubmit={(event) => {
        event.preventDefault();
        confirm(note.trim());
      }}
    >
      <div className={style.hint}>{t('remote.listen.compare', { code: code ?? '' })}</div>
      <input
        value={note}
        maxLength={200}
        aria-label={t('remote.listen.note')}
        placeholder={t('remote.listen.note')}
        autoComplete="off"
        onChange={(event) => setNote(event.target.value)}
      />
      <div className={style.buttons}>
        <button type="submit" className={style.action}>
          {t('remote.listen.match')}
        </button>
        <button type="button" className={style.action} onClick={leave}>
          {t('remote.listen.cancel')}
        </button>
      </div>
    </form>
  );
};

/** A range that sends its value when it is let go or a key is released, not on every step of the drag */
const Slider = ({
  id,
  label,
  max,
  step,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  max: number;
  step: number;
  value: number;
  onCommit: (value: number) => void;
}) => {
  const [draft, setDraft] = useState(value);

  return (
    <label htmlFor={id} className={style.slider}>
      {label}
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={(event) => onCommit(Number(event.currentTarget.value))}
        onKeyUp={(event) => onCommit(Number(event.currentTarget.value))}
      />
    </label>
  );
};

/** The buttons of what the host allowed this device to control, and none of the rest */
const HostControls = ({
  controls,
  snapshot,
  control,
}: { controls: NonNullable<RemoteListenerState['controls']>; snapshot: RemoteListenerState['nowPlaying'] } & Pick<RemoteListenerProps, 'control'>) => {
  const { t } = useTranslation();
  const duration = snapshot?.state === 'idle' ? undefined : snapshot?.duration;
  if (controls.length === 0) return null;

  return (
    <div className={style.hostControls} role="group" aria-label={t('remote.listen.controls')}>
      {controls.includes('playPause') && (
        <button type="button" className={style.action} onClick={() => control({ control: 'playPause', action: 'toggle' })}>
          {t('remote.listen.control.playPause')}
        </button>
      )}
      {controls.includes('skip') && (
        <>
          <button type="button" className={style.action} onClick={() => control({ control: 'skip', direction: 'previous' })}>
            {t('remote.listen.control.previous')}
          </button>
          <button type="button" className={style.action} onClick={() => control({ control: 'skip', direction: 'next' })}>
            {t('remote.listen.control.next')}
          </button>
        </>
      )}
      {controls.includes('seek') && duration && (
        <Slider
          id="remote-host-seek"
          label={t('remote.listen.control.seek')}
          max={duration}
          step={1}
          value={0}
          onCommit={(position) => control({ control: 'seek', position })}
        />
      )}
      {controls.includes('volume') && (
        <Slider
          id="remote-host-volume"
          label={t('remote.listen.control.volume')}
          max={100}
          step={1}
          value={100}
          onCommit={(level) => control({ control: 'volume', level: level / 100 })}
        />
      )}
    </div>
  );
};

const NowPlaying = ({ snapshot, listenAlong }: { snapshot: RemoteListenerState['nowPlaying'] } & Pick<RemoteListenerProps, 'listenAlong'>) => {
  const { t } = useTranslation();
  if (!snapshot) return null;
  if (snapshot.state === 'idle') return <div className={style.hint}>{t('remote.listen.idle')}</div>;

  return (
    <>
      {snapshot.cover && (
        <img
          className={style.cover}
          src={localUrl(`/remote/cover?t=${encodeURIComponent([snapshot.title, snapshot.artist, snapshot.album].join('|'))}`)}
          alt=""
        />
      )}
      <div className={style.hint}>{[snapshot.title, snapshot.artist].filter(Boolean).join(' – ')}</div>
      {snapshot.next && (
        <div className={style.hint}>{t('remote.listen.next', { track: [snapshot.next.title, snapshot.next.artist].filter(Boolean).join(' – ') })}</div>
      )}
      <button type="button" className={style.action} onClick={() => listenAlong(snapshot)}>
        {t('remote.listen.along')}
      </button>
    </>
  );
};

/** Pairs this app with another Tunelle that plays: the address, the code to compare, the request and what the host plays. See docs/app/remote-access-discovery.md */
const RemoteListener = ({ state, connect, confirm, leave, control, listenAlong, nearby, browse }: RemoteListenerProps) => {
  const { t } = useTranslation();

  if (!state) return null;

  const { status, target } = state;
  const address = target ? `${target.host}:${target.port}` : '';

  return (
    <section className={style.remoteListener}>
      <div className={style.sectionTitle}>{t('remote.listen.title')}</div>
      <div className={style.hint}>{t('remote.listen.hint')}</div>
      {status === 'error' && <div className={style.error}>{t('remote.listen.error', { error: state.error ?? '' })}</div>}
      {status === 'blocked' && <div className={style.error}>{t('remote.listen.blocked')}</div>}
      {status === 'revoked' && <div className={style.error}>{t('remote.listen.revoked')}</div>}
      <Nearby state={state} nearby={nearby} browse={browse} connect={connect} />
      {['idle', 'contacting', 'error', 'blocked', 'revoked'].includes(status) && <Connect state={state} connect={connect} />}
      {status === 'confirming' && <Confirm code={state.code} confirm={confirm} leave={leave} />}
      {status === 'waiting' && (
        <>
          <div className={style.hint}>{t('remote.listen.waiting', { address, code: state.code ?? '' })}</div>
          <button type="button" className={style.action} onClick={leave}>
            {t('remote.listen.cancel')}
          </button>
        </>
      )}
      {status === 'listening' && (
        <>
          <div className={style.hint}>{t('remote.listen.listening', { address })}</div>
          {state.error && <div className={style.error}>{t('remote.listen.error', { error: state.error })}</div>}
          <NowPlaying snapshot={state.nowPlaying} listenAlong={listenAlong} />
          <HostControls controls={state.controls ?? []} snapshot={state.nowPlaying} control={control} />
          <button type="button" className={style.action} onClick={leave}>
            {t('remote.listen.leave')}
          </button>
        </>
      )}
    </section>
  );
};

export default RemoteListener;
