import path from 'path';
import { utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';
import type { Track } from '@shared/types/library';
import type { ReadReply } from './track-reader-worker';

export type TrackReader = {
  /** The tags of a file, read one file at a time; rejects when the file takes longer than the timeout, and the process that was stuck on it is replaced */
  read: (fileName: string, appDataPath: string, timeout: number) => Promise<Track>;
  close: () => void;
};

/** The file was not read in the time given: a drive that stalls, or sleeps, may read it when asked again */
export class ReadTimeoutError extends Error {
  constructor(fileName: string) {
    super(`File access timeout ${fileName}`);
  }
}

/** Reads the files in a utility process, which keeps the parsing and the picture writes off the loop of the main process that serves the window and the player; it starts with the first file and ends with `close` */
export const createTrackReader = (): TrackReader => {
  type Worker = { process: UtilityProcess; pending: Map<number, { resolve: (track: Track) => void; reject: (error: Error) => void }> };
  let worker: Worker | undefined;
  let counter = 0;

  // each process has its own requests, so one that ends late does not fail the requests of the process that replaced it
  const start = (): Worker => {
    const started: Worker = {
      process: utilityProcess.fork(path.join(__dirname, 'track-reader-worker.js'), [], { serviceName: 'Tunelle library reader' }),
      pending: new Map(),
    };
    started.process.on('message', (reply: ReadReply) => {
      const waiting = started.pending.get(reply.id);
      started.pending.delete(reply.id);
      if (!waiting) return;
      if ('error' in reply) waiting.reject(new Error(reply.error));
      else waiting.resolve(reply.track);
    });
    started.process.on('exit', () => {
      if (worker === started) worker = undefined;
      [...started.pending.values()].forEach(({ reject }) => reject(new Error('The library reader ended')));
      started.pending.clear();
    });
    return started;
  };

  const stop = () => {
    const stopped = worker;
    worker = undefined;
    stopped?.process.kill();
  };

  return {
    read: (fileName, appDataPath, timeout) =>
      new Promise<Track>((resolve, reject) => {
        const current = (worker ??= start());
        const id = ++counter;
        const timer = setTimeout(() => {
          current.pending.delete(id);
          // the process may be stuck on a drive that does not answer, so it is replaced
          if (worker === current) stop();
          reject(new ReadTimeoutError(fileName));
        }, timeout);
        current.pending.set(id, {
          resolve: (track) => (clearTimeout(timer), resolve(track)),
          reject: (error) => (clearTimeout(timer), reject(error)),
        });
        current.process.postMessage({ id, fileName, appDataPath });
      }),
    close: stop,
  };
};
