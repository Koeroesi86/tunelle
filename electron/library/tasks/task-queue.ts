import { logError } from '../../utils/log-error';

/** One piece of background work */
export interface Task {
  /** What kind of work it is: the busy state and the idle time are told by kind */
  kind: string;
  /** One task of a key waits at a time: a second one with the same key takes the place of the first */
  key: string;
  /** The task with the higher number goes first; tasks of the same priority go in the order they came */
  priority: number;
  /** The signal is aborted when the queue stops; a task that takes long looks at it between its steps */
  run: (signal: AbortSignal) => Promise<void>;
  /** The task waits while this is false, and the ones behind it may go */
  canRun?: () => boolean | Promise<boolean>;
}

/** A supply of tasks that is asked when the queue has nothing queued to do, for work too big to queue at once (every track of the library) */
export interface TaskSource {
  kind: string;
  priority: number;
  canRun?: () => boolean | Promise<boolean>;
  /** The next task of the source, undefined when it has none for now */
  next: () => Promise<Pick<Task, 'key' | 'run'> | undefined>;
}

interface Candidate {
  priority: number;
  canRun?: () => boolean | Promise<boolean>;
  take: () => Promise<Task | undefined>;
}

/** Runs the background work of the app one task at a time, the most important first. See docs/app/task-queue.md */
export const createTaskQueue = (pause = 2000) => {
  const queued: Task[] = [];
  const sources = new Set<TaskSource>();
  const busy = new Map<string, number>();
  const lastEnd = new Map<string, number>();
  const createdAt = Date.now();
  const stopping = new AbortController();
  let running: Promise<void> | undefined;
  let wakeUp: (() => void) | undefined;

  const wake = () => wakeUp?.();

  /** Waits for the pause, or for what changes the queue, whichever is first */
  const rest = () =>
    new Promise<void>((done) => {
      const timer = setTimeout(() => wakeUp?.(), pause);
      wakeUp = () => {
        clearTimeout(timer);
        wakeUp = undefined;
        done();
      };
    });

  const enter = (kind: string) => busy.set(kind, (busy.get(kind) ?? 0) + 1);

  const leave = (kind: string) => {
    busy.set(kind, (busy.get(kind) ?? 1) - 1);
    lastEnd.set(kind, Date.now());
  };

  const fromQueue = (task: Task): Candidate => ({
    priority: task.priority,
    canRun: task.canRun,
    take: async () => {
      queued.splice(queued.indexOf(task), 1);
      return task;
    },
  });

  const fromSource = (source: TaskSource): Candidate => ({
    priority: source.priority,
    canRun: source.canRun,
    take: async () => {
      const next = await source.next();
      return next && { ...next, kind: source.kind, priority: source.priority };
    },
  });

  const logAndSkip = (error: unknown) => {
    logError(error);
    return undefined;
  };

  /** A condition or a source that fails is logged and counts as nothing to run, so the others go on */
  const allowed = async ({ canRun, take }: Candidate) => {
    const may = await Promise.resolve(canRun?.()).then(
      (value) => value !== false,
      (error) => {
        logError(error);
        return false;
      }
    );
    return may ? take().catch(logAndSkip) : undefined;
  };

  /** The task to run: the most important of the queued ones and the sources that may run, a queued task before a source of the same priority */
  const pick = async () => {
    const candidates = [...queued.map(fromQueue), ...[...sources].map(fromSource)].sort((a, b) => b.priority - a.priority);
    for (const candidate of candidates) {
      const task = await allowed(candidate);
      if (task) return task;
    }
    return undefined;
  };

  const execute = async (task: Task) => {
    enter(task.kind);
    await task.run(stopping.signal).catch(logError);
    leave(task.kind);
  };

  const pickSafely = () =>
    pick().catch((error) => {
      logError(error);
      return undefined;
    });

  const loop = async () => {
    while (!stopping.signal.aborted) {
      const task = await pickSafely();
      if (task) await execute(task);
      else await rest();
    }
  };

  return {
    /** Queue a task; it replaces the waiting one of its key */
    enqueue: (task: Task) => {
      const waiting = queued.findIndex((candidate) => candidate.key === task.key);
      if (waiting === -1) queued.push(task);
      else queued[waiting] = task;
      wake();
    },
    /** Add a supply of tasks; the function that comes back takes it away */
    addSource: (source: TaskSource) => {
      sources.add(source);
      wake();
      return () => sources.delete(source);
    },
    /** Work outside the queue has begun (a scan): the kind is busy until the function that comes back is called */
    begin: (kind: string) => {
      enter(kind);
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        leave(kind);
      };
    },
    isBusy: (kind: string) => (busy.get(kind) ?? 0) > 0,
    /** How long the kind has not been busy, 0 while it is; counted from the start of the queue when it has not been */
    idleFor: (kind: string) => ((busy.get(kind) ?? 0) > 0 ? 0 : Date.now() - (lastEnd.get(kind) ?? createdAt)),
    start: () => {
      running ??= loop();
    },
    /** Stops the queue: the running task is told through its signal, and the ones that wait are dropped */
    stop: () => {
      stopping.abort();
      queued.length = 0;
      wake();
      return running ?? Promise.resolve();
    },
  };
};
