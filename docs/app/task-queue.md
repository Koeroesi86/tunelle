# The background task queue

The background work of the app (what the user does not wait for, and what must not get in the way of what they do) runs through one queue, `backgroundQueue` of `electron/library/tasks/background-queue.ts`, made by `createTaskQueue` in `task-queue.ts`.

## Tasks and sources

- A **task** has a `kind`, a `key`, a `priority` and a `run(signal)`, and may have a `canRun()`. It is added with `enqueue`.
- A **source** (`addSource`) is a supply of tasks for work that is too big to queue at once, like every track of the library: the queue asks it for the next task, with `next()`, when it has a free turn.

The queue runs one task at a time. The most important goes first; tasks of the same priority go in the order they came, and a queued task goes before a source of the same priority. A task that is added with the key of a waiting one replaces it, in its place.

## What may run

`canRun` is asked before a task or a source is taken, and the ones behind it may go while it says no. A `canRun` or a `next` that throws is logged and counts as no, so one broken condition does not stop the rest. When nothing may run the queue looks again after a pause (2 s), or at once when something is added.

A running task is not interrupted by a more important one: it ends, and the queue goes on with the new one. A task that takes long looks at its `signal` between its steps, which is aborted when the queue stops (`stop` also drops the tasks that wait, and answers when the running one is over).

## Tasks on the queue

- The loudness measurement is a source (`loudness-source.ts`), at priority 1.
- Picking the colours of the album pictures (`queueAlbumArtAccents`) is a task of the kind `album-art` at priority 2, queued at the end of a scan and run once no scan is going on. A scan no longer waits for it.

## Scans and the watching of the folders

The work of the library is queued with `queueTask` (`queue-task.ts`), which answers when the task is over and shares the answer between callers of a key that waits:

- `rescanLibrary` (the scan at start, a forced one, the folders that came back), `rescanChanges` (what the folder watcher reported, after its quiet time) and the scan of the folders that are added are tasks of the kind `scan` at priority 10, so they come before any other work and never run two at once. A rescan that waits is shared, and is complete when any of the callers asked for it.
- The look at the watched folders for a change that the watch did not report (`checkLibraryWatching`) is a task of the kind `watch` at priority 5.
- A task never waits for another queued task, as the queue runs one at a time: `scanFolder` and `scanFolders` run inside the task of their caller.

`trackScan` still tells the queue with `begin('scan')` for each folder it scans, and `isBusy(kind)` and `idleFor(kind)` tell what is going on, so work that must wait for the disk waits for the scans to be over for a while. `idleFor` counts from the start of the queue for a kind that has not been busy yet.

The watcher of the folders itself (`folder-watcher.ts`) only reports what the system tells it and does no work of its own; what it reports is scheduled by `rescan-scheduler.ts` and scanned as a task.
