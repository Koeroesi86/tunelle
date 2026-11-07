import { z } from 'zod';

/** The kinds of background work the window shows; the queue runs more kinds than these, which it does not show */
const backgroundTaskKinds = ['scan', 'watch', 'loudness', 'album-art'] as const;

/** One kind of work of the background queue: whether a task of it runs and how many wait. See docs/app/task-queue.md */
export const backgroundTaskSchema = z.object({
  kind: z.enum(backgroundTaskKinds),
  running: z.boolean(),
  waiting: z.number(),
});

export const backgroundTasksSchema = z.object({ tasks: z.array(backgroundTaskSchema) });

export type BackgroundTask = z.infer<typeof backgroundTaskSchema>;
