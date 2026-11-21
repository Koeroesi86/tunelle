/** What a task that waited for its turn gets when it was dropped before it ran */
export class Dropped extends Error {
  constructor() {
    super('The request was dropped before it ran');
  }
}

interface Waiting {
  tag: string;
  resume: () => void;
  drop: () => void;
}

/** Lets a few tasks of a key run at a time and the rest as they finish; a server that is asked for dozens of things at once answers all of them late or refuses. A task that still waits can be dropped by its tag */
export const createGate = (limit: number) => {
  const slots = new Map<string, { active: number; queue: Waiting[] }>();

  const release = (key: string) => {
    const slot = slots.get(key);
    const next = slot?.queue.shift();
    if (next) next.resume();
    else if (slot) slot.active -= 1;
  };

  const run = async <T>(key: string, task: () => Promise<T>, tag = ''): Promise<T> => {
    const slot = slots.get(key) ?? { active: 0, queue: [] };
    slots.set(key, slot);
    if (slot.active < limit) slot.active += 1;
    else await new Promise<void>((resume, reject) => slot.queue.push({ tag, resume, drop: () => reject(new Dropped()) }));

    return task().finally(() => release(key));
  };

  /** The waiting tasks of the key whose tag the test says so are not run: they fail with `Dropped`, and their tags are given back; those that run are left to finish */
  const drop = (key: string, dropped: (tag: string) => boolean) => {
    const slot = slots.get(key);
    const gone = slot?.queue.filter(({ tag }) => dropped(tag)) ?? [];
    if (slot) slot.queue = slot.queue.filter(({ tag }) => !dropped(tag));
    gone.forEach((waiting) => waiting.drop());

    return gone.map(({ tag }) => tag);
  };

  return Object.assign(run, { drop });
};
