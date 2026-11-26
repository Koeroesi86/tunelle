# Remote access: following the host

Events, controls, what the listener shows and who the player follows. Part of [Remote access: discovery, certificate and now-playing route](remote-access-discovery.md).

## Checks for the next pull requests

- Electronegativity baseline and the CSP: the listener only talks from the main process, so the renderer's CSP stays as is; re-run `npm run security:electron` with the server in.
- Integration tests with a real TLS server use this certificate code on every system; discovery over multicast loopback only if it works on CI.

## Events, leaving and one mode at a time (part 13)

- `followNowPlaying` (`listener-client.ts`) reads the stream: it resolves `revoked` for a 401 (the host forgot the device, also when it reconnects after a revoke closed the stream), `ended` when the host closed it, and rejects on a failure or after 60 s with nothing (the host pings every 25 s). The controller keeps the last track on screen, shows the error and connects again after one second. Every connect, leave or start closes the open stream at once (`begin()` in `listener-controller.ts`), so a stream of an older run does not outlive it.
- Own playback leaves the session: `useRemoteFollow` calls `LEAVE_REMOTE_HOST` when the loaded track changes from the remote one to any other, so the main process stops listening and forgets the pairing (the next listen goes through the code and the approval again). Symptom before: the stream and the host's device list kept the app as a listener while it played its own music.
- One mode at a time: `register-remote-listeners.ts` leaves the host it listens to before the host mode goes on, and turns the host mode off before it connects to a host. Checked only by unit tests, not on two computers.

## Controls on the listener (part 14)

- The host's event stream carries a second kind of message, `event: controls` with the list of what this device may control. It is sent when the stream opens and again when the host changes the controls of a device or decides on it (`refreshControls` in `host-routes.ts`, called by `host-controller.ts`), so the buttons on the listener follow the host's checkboxes at once. `followNowPlaying` reads it into `onControls`; the controller keeps it as `controls` in the listener state (`shared/schemas/remote-listener.ts`).
- `sendControl` posts a command to `/remote/control` (pinned, with the secret). The host still checks every command against what it allowed that device, so a page that sends a command it was not given gets a 403, which the listener shows as the error `The host answered 403`. The command schema moved to `shared/schemas/remote-control.ts`, used by both processes and the host page.
- The page reaches it through the action `SEND_REMOTE_CONTROL` and the channel of the same name (parsed in the main process). The tile shows play or pause, previous and next, a position slider (only when the track has a length) and a volume slider, each only for a control that was granted; a slider sends its value when it is let go, not on each step. The sliders do not show the position or volume of the host, as the listener does not know the volume and the position moves.
- `queue` is not a command and is not planned: a listener does not add to the queue of the host.

## Cover and what plays next (part 15)

- The now playing carries `cover` (true when the host has a cover for the track) and `next` (title and artist of the track that plays after it, `uiState.upNext`). The page sends the key of the cover (`coverKey`, the name of the optimized file in the album art folder, `optimizedCoverOf`) beside the library path; like the path it stays in the main process of the host and never reaches a listener, who only learns that a cover exists.
- `GET /remote/cover` (approved devices only, 404 without a key) serves the cover of the track that plays now through `serveCover` (`serve-cover.ts`: `resolveAlbumArt` of the file name, never a path). The listener relays it as `tunelle://app/remote/cover` (`fetchCover`, `remote-media.ts`, the protocol route), so the page names no host and a listener that is not approved gets a 404. The tile shows the cover with the title and the next track as text. The player bar does not show it for the followed track yet.

## The session ends in the player (part 16)

- Symptom found by the end to end test (`e2e/functional/remote.spec.ts`, revoke): the host revoked the device, the relay of the audio ended, and the listener still played the rest of the track, as the audio element had buffered the whole file. Cause: only the stream and the relay ended, nothing told the player. `useRemoteFollow` now pauses a loaded remote track when the listener state has no snapshot (revoked, blocked, left, or a new contact). Check: run the revoke test; it waits for silence on the listener.
- The end to end tests cover listening along, pause and play, the next track, a seek, a revoke, and a skip that the host granted, each asserted on the audio (`expectTone`, `expectSilence`) or the playback position, with no sleeps.

## Position and cover while following (part 17)

- Symptoms found by hand on two apps: listening along while the listener already played started the track from the beginning, a paused listener stayed where it was while the host went on, and the player bar showed no cover. Cause: the position was only compared when the host sent a snapshot, and the host sends one only when something changes; the remote track had no picture. `useRemoteFollow` now compares the position once when the track is loaded and every second after (`FOLLOW_MS`), whether the listener plays or not, and a remote track with a cover has the picture `remote-cover`, which `toNowPlaying` turns into `/remote/cover`. Check: join a host that plays 1 minute into a track from a listener that plays something else; the position is within a second of the host, and the cover shows in the player bar.

## The cover on the home view (part 18)

- The "continue" tile of the home view took the picture `remote-cover` of a followed track for a file name and asked `/covers/remote-cover`, which gives a 404 and an empty tile. `trackCoverUrl` (`client/domain/remote-track.ts`) is the one place that turns a track into a cover address, for the player bar and the tile. The recent list shows no cover for a followed track on purpose: the host serves only the cover of what it plays now. Check: follow a host with a cover, stop the player, open the home view; the tile shows the cover of the host.

## The sliders start where the host is (part 19)

- The seek and volume sliders of the host controls started at 0 and 100 whatever the host did. The snapshot now has the optional `volume` (0 to 1; the host sends it again when it changes), the seek slider starts from `expectedPosition` and moves on every second, and the volume slider from the volume. A slider that is held (pointer or key down) is not moved until it is let go, or the drag would jump. Check: give a listener the seek and volume controls, play a track on the host at half volume; the sliders show the position and 50, and the position moves on.

## Who the player follows (part 20)

- While the app listens, the player bar shows "Listening to <name>" and a button to stop, so leaving does not need the settings page. The name is the one the host announces when it is among the Tunelles nearby, else its address (`hostNameOf` in `client/containers/layout/player-controls/index.tsx`). The compact layout (below 600 px) has no room in its two rows and a 44 px target would not fit a third one, so it does not show it; leaving stays in the settings there. Check: follow a host, the bar shows the name and the button; the button stops the audio and the bar goes back.

## Words of the main process, the version and `queue` (part 21)

- The errors that the listener shows (the host did not answer, answered with a status, closed the connection, was not answered, approved this device before) were English strings of `listener-controller.ts`. They are `remote.listen.failure.*` of `en.json` now, worded with `getMainTranslator()`. `listener-client.ts` runs in the integration tests without Electron, so it cannot import the translator: a command that the host refused throws `HostAnswerError` with the status, and the controller words it. The unit test of the controller mocks `../language` with the English translator; a test that mocks `./listener-client` must keep the real `HostAnswerError`, or the status is lost.
- `createHostController` takes the version as a required argument (before the optional `serveAudio` and `serveCover`); the default `''` was there for the tests only.
- `queue` is not planned: a listener does not add to the queue of the host, so the control is not granted or offered, and it needs no command.
- `npm run security:electron` on this stack reports 8 findings, none new.
- Part 22: Nearby Tunelles is a source of its own in the sidebar next to Radio (`onlineView` is `radio` or `nearby`; the app starts on `radio`), not a tile of the settings. Only the shown source is mounted, as it browses the network while it is; the connection to a host goes on when the page is left. Checked by unit tests, not by hand in the running app. The sidebar groups them as Online (Radio stations, Nearby Tunelles) like the Library, open or closed by `onlineOpen`.
- Part 23: while host mode is on, the Nearby Tunelles page is shown disabled (a `fieldset disabled`, so the controls and the form cannot be used) with a note, and it does not browse the network. The note gives how to connect to this host: the host state carries `addresses` (the IPv4 addresses of the networks from `lanAddresses` in `mdns.ts`, or `127.0.0.1` in loopback mode), with the port and the code. Checked by unit tests, not by hand.
- Part 24: leaving a host keeps the approval, marked `left` in `listener.json`, and does not forget it. Symptom before: after "Stop listening" the host still knew the device as approved and gave no second secret, so a new request ended in "approved this device before; ask the host to revoke it". Now `connect` compares the certificate of the host with the saved one and follows it again at once (the address is updated, `left` is cleared) with no request; `start` does not follow a host that was left; a revoke or a block still forgets it, and another certificate asks as before.
- Part 25: a radio station on the host is relayed to the listeners. The page sends the `station` uuid (and no path); the host keeps `station:<uuid>` as the source of `/remote/audio` (`STATION_PREFIX`, `shared/constants/remote-source.ts`), serves it with `serveRadio` (the same code as the station protocol, a connection of its own to the station per listener, no ICY metadata), and marks the snapshot `live`. The listener plays it as it comes: no seek and no drift correction for a live snapshot, and the key of a remote track includes `live`. A bad uuid drops the source. Not covered: a listener that pauses a station keeps what it buffered and plays old audio on resume (the host's own player reconnects, the listener's does not yet); the host's player and the relay are two connections to the station.
