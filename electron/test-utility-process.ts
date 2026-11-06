import { vi } from 'vitest';
import { EventEmitter } from 'events';
import type { ReadRequest } from './library/reading/track-reader-worker';
import type { ProbeRequest } from './library/mounts/mount-probe-worker';

/** The utility process of the tests: it answers like the worker of the app does, in the process of the test, so a test reads real files (or the `music-metadata` it mocks) without Electron */
class FakeUtilityProcess extends EventEmitter {
  postMessage = async (request: ReadRequest | ProbeRequest) => {
    if ('kind' in request) {
      const { answerProbe } = await import('./library/mounts/mount-probe-worker');
      this.emit('message', await answerProbe(request));
      return;
    }
    const { answer } = await import('./library/reading/track-reader-worker');
    this.emit('message', await answer(request));
  };

  kill = () => {
    this.emit('exit', 0);
    return true;
  };
}

vi.mock('electron', () => ({
  utilityProcess: { fork: () => new FakeUtilityProcess() },
}));
