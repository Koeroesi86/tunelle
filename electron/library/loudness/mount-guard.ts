import path from 'path';
import { utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';
import type { ProbeReply } from './mount-probe-worker';

/** A file that does not answer in this time is on a drive that does not answer */
const probeTimeout = 10_000;

interface Probe {
  process: UtilityProcess;
  /** The answer that is waited for; none while the process has nothing to do */
  waiting?: (readable: boolean) => void;
  /** A request was given up on: the process may be stuck on the drive for ever, and is left alone until it ends */
  stuck: boolean;
}

/**
 * Asks whether a file can be read, from a process of its own for each mount, so a share that went away holds up that process and not the main
 * process. A mount with a process that is stuck answers no, until the process ends. See docs/app/loudness-measurement.md
 */
export const createMountGuard = () => {
  const probes = new Map<string, Probe>();
  let counter = 0;

  const start = (mount: string) => {
    const probe: Probe = {
      process: utilityProcess.fork(path.join(__dirname, 'mount-probe-worker.js'), [], { serviceName: 'Tunelle drive check' }),
      stuck: false,
    };
    probe.process.on('message', (reply: ProbeReply) => probe.waiting?.(reply.readable));
    probe.process.on('exit', () => {
      probe.waiting?.(false);
      if (probes.get(mount) === probe) probes.delete(mount);
    });
    probes.set(mount, probe);
    return probe;
  };

  return {
    /** Whether the file can be read, asked of the process of its mount (a library folder); no for a file that cannot, and for a mount that does not answer */
    isReadable: (mount: string, fileName: string) => {
      const probe = probes.get(mount) ?? start(mount);
      if (probe.stuck) return Promise.resolve(false);

      return new Promise<boolean>((resolve) => {
        const settle = (readable: boolean) => {
          clearTimeout(timer);
          probe.waiting = undefined;
          resolve(readable);
        };
        const timer = setTimeout(() => {
          probe.stuck = true;
          probe.process.kill();
          settle(false);
        }, probeTimeout);
        probe.waiting = settle;
        probe.process.postMessage({ id: ++counter, fileName });
      });
    },
    close: () => {
      probes.forEach(({ process }) => process.kill());
      probes.clear();
    },
  };
};
