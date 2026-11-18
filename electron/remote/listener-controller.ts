import type { ControlCommand } from '../../shared/schemas/remote-control';
import type { RemoteListenerState } from '../../shared/schemas/remote-listener';
import { approvalCode } from './certificate';
import {
  contact,
  fetchAudio,
  fetchCover,
  followNowPlaying,
  HostAnswerError,
  requestToListen,
  sendControl,
  type Contact,
  type HostAddress,
} from './listener-client';
import type { ListenerStore, Pairing } from './listener-store';
import { getMainTranslator } from '../language';

export const POLL_MS = 1000;
/** The host drops a request that nobody answered after ten minutes, so asking longer does not help */
export const ASK_LIMIT_MS = 10 * 60 * 1000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const messageOf = (failure: unknown) => {
  const { t } = getMainTranslator();
  if (failure instanceof HostAnswerError) return t('remote.listen.failure.answered', { status: failure.status });
  return failure instanceof Error ? failure.message : t('remote.listen.failure.silent');
};

/**
 * The listener side of the app: the first contact with a host, the request to listen, and the now playing of the host once approved.
 * One host at a time; a new connect or a leave ends what runs. See docs/app/remote-access-discovery.md
 */
export const createListenerController = (store: ListenerStore, deviceName: string, onChange: (state: RemoteListenerState) => void) => {
  let state: RemoteListenerState = { status: 'idle' };
  // the certificate of a host that was contacted and waits for the user to compare the code
  let contacted: (Contact & HostAddress) | undefined;
  // every connect, leave and start takes a new number, so a loop that belongs to an older one ends
  let run = 0;
  // the host that is followed now, which the relay of the audio reaches and nothing else
  let active: { pairing: Pairing; deviceId: string } | undefined;
  // ends the open event stream of the host that is followed
  let stopStream = () => {};

  // a new number for whatever starts or ends; the stream of the host that was followed closes with it
  const begin = () => {
    stopStream();
    return ++run;
  };

  const publish = (next: RemoteListenerState) => {
    state = next;
    onChange(state);
  };

  /** One connection of the event stream, then the pause; false when the loop ends (the run changed, or the host forgot this device) */
  const poll = async (pairing: Pairing, deviceId: string, token: number) => {
    const target = { host: pairing.host, port: pairing.port };
    const code = approvalCode(pairing.certificate);
    const stop = new AbortController();
    stopStream = () => stop.abort();
    const ended = await followNowPlaying(
      target,
      pairing.certificate,
      deviceId,
      pairing.secret,
      {
        onSnapshot: (nowPlaying) => token === run && publish({ ...state, status: 'listening', target, code, nowPlaying, error: undefined }),
        onControls: (controls) => token === run && publish({ ...state, status: 'listening', target, code, controls }),
      },
      stop.signal
    ).catch((failure: unknown) => (token === run ? failure : 'ended'));
    if (token !== run) return false;
    if (ended === 'revoked') return revoke(token).then(() => false);

    // the stream ended or failed: the last track stays on the screen, and the host is asked again after the pause
    publish({ ...state, status: 'listening', error: ended === 'ended' ? getMainTranslator().t('remote.listen.failure.closed') : messageOf(ended) });
    await wait(POLL_MS);
    return true;
  };

  const follow = async (pairing: Pairing, deviceId: string, token: number) => {
    active = { pairing, deviceId };
    publish({ status: 'listening', target: { host: pairing.host, port: pairing.port }, code: approvalCode(pairing.certificate) });

    while (token === run && (await poll(pairing, deviceId, token)));
  };

  // a host that does not know the device any more: the pairing is of no use, the user asks again
  const revoke = async (token: number) => {
    active = undefined;
    await store.clearPairing();
    if (token === run) publish({ status: 'revoked', target: state.target, code: state.code });
  };

  const ask = async (target: Contact & HostAddress, note: string, token: number) => {
    const deviceId = await store.deviceId();
    const address = { host: target.host, port: target.port };
    const base = { target: address, code: target.code };
    const until = Date.now() + ASK_LIMIT_MS;
    publish({ status: 'waiting', ...base });

    // one request and the pause that follows it; false when the loop ends (an answer, or the run changed)
    const once = async () => {
      const answer = await requestToListen(address, target.certificate, { deviceId, deviceName, note });
      if (token !== run) return false;

      if (answer.status === 'approved' && answer.secret) {
        const pairing = { host: target.host, port: target.port, certificate: target.certificate, secret: answer.secret };
        await store.savePairing(pairing);
        await follow(pairing, deviceId, token);
        return false;
      }
      // the secret comes once: an approval without it was picked up before, and only a new approval gives another
      if (answer.status === 'approved') {
        publish({ status: 'error', ...base, error: getMainTranslator().t('remote.listen.failure.approvedBefore') });
        return false;
      }
      if (answer.status === 'blocked') {
        publish({ status: 'blocked', ...base });
        return false;
      }
      if (answer.status !== 'pending') {
        publish({ status: 'error', ...base, error: getMainTranslator().t('remote.listen.failure.answered', { status: answer.status }) });
        return false;
      }

      await wait(POLL_MS);
      return true;
    };

    let open = true;
    while (open && token === run && Date.now() < until) open = await once();
    if (open && token === run) publish({ status: 'error', ...base, error: getMainTranslator().t('remote.listen.failure.unanswered') });
  };

  const fail = (token: number, failure: unknown, base: Partial<RemoteListenerState> = {}) => {
    if (token === run) publish({ status: 'error', ...base, error: messageOf(failure) });
  };

  return {
    state: () => state,
    /** Follows the host of the last approval, when there is one and the user did not leave it */
    start: async () => {
      const token = begin();
      active = undefined;
      const [pairing, deviceId] = await Promise.all([store.readPairing(), store.deviceId()]);
      if (pairing && !pairing.left && token === run) await follow(pairing, deviceId, token);
    },
    /** The first contact: the code of the certificate goes to both screens, and nothing is asked before the user compared them */
    connect: async (address: HostAddress) => {
      const token = begin();
      active = undefined;
      contacted = undefined;
      publish({ status: 'contacting', target: address });
      const reached = await contact(address).then(
        (found) => ({ found }),
        (failure: unknown) => ({ failure })
      );
      if (token !== run) return;
      if ('failure' in reached) return fail(token, reached.failure, { target: address });

      const known = await store.readPairing();
      if (token !== run) return;
      // a host that approved this device before knows it: no second request (it would not give the secret again), the pinned certificate is the proof
      if (known && known.certificate === reached.found.certificate) {
        const again = { ...known, ...address, left: undefined };
        await store.savePairing(again);
        return follow(again, await store.deviceId(), token);
      }

      contacted = { ...reached.found, ...address };
      publish({ status: 'confirming', target: address, code: reached.found.code });
    },
    /** The user saw the same code on both screens: the request goes out, pinned to the certificate that gave the code */
    confirm: async (note: string) => {
      const target = contacted;
      if (!target) return;

      const token = begin();
      contacted = undefined;
      await ask(target, note, token).catch((failure: unknown) => fail(token, failure, { target: { host: target.host, port: target.port }, code: target.code }));
    },
    /** The audio of the track the host plays, for the player of the page: the range of the request goes on, and nothing names a host or a file */
    audio: async (request: Request) => {
      if (!active) return new Response(undefined, { status: 404 });

      const { pairing, deviceId } = active;
      return fetchAudio(
        { host: pairing.host, port: pairing.port },
        pairing.certificate,
        deviceId,
        pairing.secret,
        request.headers.get('range') ?? undefined,
        request.signal
      ).catch(() => new Response(undefined, { status: 502 }));
    },
    /** The cover of the track the host plays, for the tile of the page */
    cover: async (request: Request) => {
      if (!active) return new Response(undefined, { status: 404 });

      const { pairing, deviceId } = active;
      return fetchCover({ host: pairing.host, port: pairing.port }, pairing.certificate, deviceId, pairing.secret, request.signal).catch(
        () => new Response(undefined, { status: 502 })
      );
    },
    /** A command of the page for the host that is followed; the host checks it against what it allowed this device */
    control: async (command: ControlCommand) => {
      if (!active) return;

      const { pairing, deviceId } = active;
      await sendControl({ host: pairing.host, port: pairing.port }, pairing.certificate, deviceId, pairing.secret, command).catch((failure: unknown) =>
        publish({ ...state, error: messageOf(failure) })
      );
    },
    /** Stops listening. The approval stays (marked as left), so the same host can be listened to again without a new request */
    leave: async () => {
      begin();
      active = undefined;
      contacted = undefined;
      const saved = await store.readPairing();
      if (saved) await store.savePairing({ ...saved, left: true });
      publish({ status: 'idle' });
    },
  };
};
