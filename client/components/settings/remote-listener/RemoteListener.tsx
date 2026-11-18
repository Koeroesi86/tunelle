import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import style from './RemoteListener.scss';
import { useTranslation } from '../../../i18n';
import type { RemoteListenerState } from '@shared/schemas/remote-listener';
import type { NowPlaying as NowPlayingSnapshot } from '@shared/schemas/now-playing';
import type { NearbyHost } from '@shared/schemas/remote-nearby';

interface RemoteListenerProps {
  state: RemoteListenerState | undefined;
  connect: (host: string, port: number) => void;
  confirm: (note: string) => void;
  leave: () => void;
  nearby: NearbyHost[];
  browse: (active: boolean) => void;
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

const NowPlaying = ({ snapshot, listenAlong }: { snapshot: RemoteListenerState['nowPlaying'] } & Pick<RemoteListenerProps, 'listenAlong'>) => {
  const { t } = useTranslation();
  if (!snapshot) return null;
  if (snapshot.state === 'idle') return <div className={style.hint}>{t('remote.listen.idle')}</div>;

  return (
    <>
      <div className={style.hint}>{[snapshot.title, snapshot.artist].filter(Boolean).join(' – ')}</div>
      <button type="button" className={style.action} onClick={() => listenAlong(snapshot)}>
        {t('remote.listen.along')}
      </button>
    </>
  );
};

/** Pairs this app with another Tunelle that plays: the address, the code to compare, the request and what the host plays. See docs/app/remote-access-discovery.md */
const RemoteListener = ({ state, connect, confirm, leave, listenAlong, nearby, browse }: RemoteListenerProps) => {
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
          <button type="button" className={style.action} onClick={leave}>
            {t('remote.listen.leave')}
          </button>
        </>
      )}
    </section>
  );
};

export default RemoteListener;
