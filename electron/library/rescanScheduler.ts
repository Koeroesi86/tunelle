import { changeKey } from './libraryChange';
import type { Change } from './libraryChange';

/** The places that changed are scanned once after a quiet time, so a big copy is one scan; a change during a scan is scanned after it, never two scans at once */
export const createRescanScheduler = (run: (changes: Change[]) => Promise<void>, quietTime = 2000) => {
  const pending = new Map<string, Change>();
  let timer: NodeJS.Timeout | undefined;
  let running = false;

  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, quietTime);
  };

  async function flush() {
    if (running || pending.size === 0) return;

    const changes = [...pending.values()];
    pending.clear();
    running = true;
    await run(changes)
      .catch((e) => console.error(e))
      .finally(() => {
        running = false;
      });
    if (pending.size > 0) arm();
  }

  return {
    schedule: (changes: Change[]) => {
      changes.forEach((change) => pending.set(changeKey(change), change));
      arm();
    },
    cancel: () => {
      clearTimeout(timer);
      pending.clear();
    },
  };
};
