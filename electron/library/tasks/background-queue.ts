import { createTaskQueue } from './task-queue';

/** The queue of the background work of the app: what the user does not wait for and what must not get in the way of it */
export const backgroundQueue = createTaskQueue();

/** The kind of a scan of the library, which comes before any other work and which the other work waits to be over */
export const scanKind = 'scan';
