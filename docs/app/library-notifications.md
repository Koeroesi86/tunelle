# Library notifications and the task indicator

## The indicator in the title bar

The title bar shows a pill while the [background queue](task-queue.md) has work. Hovering or focusing it lists the kinds of work that run or wait, with the number of tasks that wait: scanning the library, watching the library folders, loudness normalization and the colours of the album art.

The queue tells its state with `snapshot()` (`task-queue.ts`): for each kind whether a task of it runs and how many wait. A source adds what it has left with `pending()`, and says so with `refresh()` when that changed; the loudness source counts the tracks that are not measured, and none while the measurement is off or rests (the tracks of a drive that is away stay unmeasured for good).

`register-background-task-listeners.ts` sends the state to the window as the message `BACKGROUND_TASKS` (schema in `shared/schemas/background-tasks.ts`) at most every 250 ms and only when it changed, and answers `BACKGROUND_TASKS_LOAD` with it when the window starts. It is a message and not a route of the [protocol](tunelle-protocol.md), as the state changes by itself and the other status of the main process (`LOUDNESS_STATUS`, the progress of a scan) travels the same way. The kinds that the window does not name are left out.

## The notification

A scan that changed the library is told with a desktop notification, for example "Library updated: 42 tracks added, 3 removed". `recordLibraryChange` (`electron/library/changes/library-changes.ts`) is called with the tracks that were stored as new, stored again (updated) and removed:

- `scan-folder.ts` for the batches it stores, `rescan-changes.ts` and `rescan-library.ts` for the tracks they remove. Removing a folder in the settings is the user's own act and is not told.
- The changes are added up. Ten seconds after the last one, and once no scan goes on, one notification tells the total, so the first scan of a folder with thousands of tracks and a burst of the folder watch each give one.
- Nothing is sent when nothing changed, when the window is in front (the indicator is enough then), when `Notification.isSupported()` is false, or when the setting is off.
- Clicking the notification restores and focuses the window.

The setting is `notifyLibraryChanges` in the saved settings (on unless a saved off), shown in the settings as "Library notifications". On Windows the notification uses the app user model id of `electron/app-user-model-id.ts`.
