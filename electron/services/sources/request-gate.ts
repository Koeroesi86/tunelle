/** Lets a few tasks of a key run at a time and the rest as they finish; a server that is asked for dozens of things at once answers all of them late or refuses */
export const createGate = (limit: number) => {
  const slots = new Map<string, { active: number; queue: (() => void)[] }>();

  const release = (key: string) => {
    const slot = slots.get(key);
    const next = slot?.queue.shift();
    if (next) next();
    else if (slot) slot.active -= 1;
  };

  return async <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const slot = slots.get(key) ?? { active: 0, queue: [] };
    slots.set(key, slot);
    if (slot.active < limit) slot.active += 1;
    else await new Promise<void>((resolve) => slot.queue.push(resolve));

    return task().finally(() => release(key));
  };
};
