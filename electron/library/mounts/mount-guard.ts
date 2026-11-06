import path from 'path';
import { utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';
import type { ProbeKind, ProbeReply } from './mount-probe-worker';

/** A call that does not answer in this time is on a drive that does not answer */
const probeTimeout = 10_000;

/** What a folder answers; the fields depend on the call */
type MountAnswer = Omit<ProbeReply, 'id'>;

interface Probe {
  process: UtilityProcess;
  /** The calls that wait for an answer, by id */
  waiting: Map<number, (reply: MountAnswer) => void>;
  /** A call was given up on: the process may be stuck on the drive for ever, and is left alone until it ends */
  stuck: boolean;
}

const noAnswer: MountAnswer = { readable: false };

/**
 * Makes the calls on a folder or a file from a process of its own for each mount, so a share that went away holds up that process and not the main
 * process. A mount with a process that is stuck answers no, until the process ends. See docs/app/mount-guard.md
 */
export const createMountGuard = () => {
  const probes = new Map<string, Probe>();
  let counter = 0;

  const release = (probe: Probe) => {
    const pending = [...probe.waiting.values()];
    probe.waiting.clear();
    pending.forEach((settle) => settle(noAnswer));
  };

  const start = (mount: string) => {
    const probe: Probe = {
      process: utilityProcess.fork(path.join(__dirname, 'mount-probe-worker.js'), [], { serviceName: 'Tunelle drive check' }),
      waiting: new Map(),
      stuck: false,
    };
    probe.process.on('message', ({ id, ...reply }: ProbeReply) => probe.waiting.get(id)?.(reply));
    probe.process.on('exit', () => {
      release(probe);
      if (probes.get(mount) === probe) probes.delete(mount);
    });
    probes.set(mount, probe);
    return probe;
  };

  const ask = (mount: string, kind: ProbeKind, target: string) => {
    const probe = probes.get(mount) ?? start(mount);
    if (probe.stuck) return Promise.resolve(noAnswer);

    return new Promise<MountAnswer>((resolve) => {
      const id = ++counter;
      const settle = (reply: MountAnswer) => {
        clearTimeout(timer);
        probe.waiting.delete(id);
        resolve(reply);
      };
      const timer = setTimeout(() => {
        probe.stuck = true;
        probe.process.kill();
        release(probe);
      }, probeTimeout);
      probe.waiting.set(id, settle);
      probe.process.postMessage({ id, kind, path: target });
    });
  };

  return {
    /** Whether the file can be read, asked of the process of its mount (a library folder); no for a file that cannot, and for a mount that does not answer */
    isReadable: (mount: string, fileName: string) => ask(mount, 'file', fileName).then(({ readable }) => readable),
    /** Whether the folder can be listed and has no entry; no answer (undefined) for a folder that cannot be read and for a mount that does not answer */
    isEmpty: (mount: string, folder: string) => ask(mount, 'entries', folder).then(({ readable, empty }) => (readable ? empty : undefined)),
    /** The modification time of the folder, undefined when it cannot be read or does not answer */
    readTime: (mount: string, folder: string) => ask(mount, 'stat', folder).then(({ time }) => time),
    /** The names in the folder and its time; the reply has no names when it cannot be read (with the error `code`) or does not answer */
    list: (mount: string, folder: string) => ask(mount, 'listing', folder),
    close: () => {
      probes.forEach(({ process }) => process.kill());
      probes.clear();
    },
  };
};

let shared: ReturnType<typeof createMountGuard> | undefined;

/** The guard that all the calls on library folders share, so a mount has one process whoever asks */
export const mountGuard = () => (shared ??= createMountGuard());
