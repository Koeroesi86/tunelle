# Sleep and a crash of the page

## Sleep

On `powerMonitor` `suspend` the main process sends `SET_PLAYING` with `false` to the page (`electron/listeners/register-window-listeners.ts`). It is the same pause as the one of the button: a file keeps its position, a station lets go of its stream and connects to the live one when play is pressed. Nothing happens on `resume`, so the player stays paused.

The message is queued before the computer sleeps. Whether the page handles it before or after the sleep is not known.

A player that follows a remote host (see [following a host](remote-access-follow.md)) does what the host does, so a host that plays after the wake starts it again.

## A crash of the page

`electron/windows/recover-renderer.ts` loads the page again when its process is gone (`render-process-gone`, any reason but `clean-exit`). After 3 reloads within a minute the next crash shows a message and closes the app: the window has no frame, so a dead page leaves nothing to close it with.

A page that crashed saved nothing on its way out, as `beforeunload` did not run. So the page sends `PLAYBACK_SNAPSHOT` as it goes, and the main process keeps it in memory (`electron/listeners/register-state-listeners.ts`) and lays it over the saved settings on the next `APP_READY`:

- the queue, the played tracks, the track, shuffle, repeat and the volume, when they change (`client/redux/connection/playback-watcher.ts`);
- the position of a file once a second, from the `timeupdate` of the element that plays (`AudioComponent.tsx`). The time of the controls is not used, as its timer stops while the window is hidden.

The volume is in the snapshot so that a restored player does not play louder than it did. Any other setting that was not saved before the crash is back at its saved value. Nothing is written to the library, so a crash of the main process restores the last saved state.

The restored player is paused. A station that is paused is not loaded at all, after a restart and with a new audio context too: it connects when play is pressed.

Files that the system opens while the page is gone wait for the new one (see [opening files](open-files.md)).
