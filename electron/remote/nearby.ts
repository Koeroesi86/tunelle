import { browse } from './mdns';
import type { NearbyHost } from '../../shared/schemas/remote-nearby';
import { logError } from '../utils/log-error';

/** The list of Tunelles on the network. The socket is open only while the page shows the list; a list that cannot be made is an empty one. See docs/app/remote-access-discovery.md */
export const createNearby = (onChange: (hosts: NearbyHost[]) => void) => {
  let browser: Awaited<ReturnType<typeof browse>> | undefined;
  let changing: Promise<void> = Promise.resolve();

  const start = async () => {
    if (browser) return;
    browser = await browse(onChange).catch((failure: unknown) => (logError(failure), undefined));
  };

  const stop = async () => {
    await browser?.stop().catch(logError);
    browser = undefined;
    onChange([]);
  };

  // one change at a time: a quick open and close of the list does not leave a socket behind
  const queue = (task: () => Promise<void>) => {
    changing = changing.then(task, task);
    return changing;
  };

  return {
    start: () => queue(start),
    stop: () => queue(stop),
  };
};
