import { vi } from 'vitest';
import { EventEmitter } from 'events';
import type { ReadRequest } from './library/reading/trackReaderWorker';

/** The utility process of the tests: it answers like the worker of the app does, in the process of the test, so a test reads real files (or the `music-metadata` it mocks) without Electron */
class FakeUtilityProcess extends EventEmitter {
  postMessage = async (request: ReadRequest) => {
    const { answer } = await import('./library/reading/trackReaderWorker');
    const reply = await answer(request);
    this.emit('message', reply);
  };

  kill = () => {
    this.emit('exit', 0);
    return true;
  };
}

vi.mock('electron', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  utilityProcess: { fork: () => new FakeUtilityProcess() },
}));
