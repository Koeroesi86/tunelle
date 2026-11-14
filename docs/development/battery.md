# Measuring the battery use

The saving of the app is described in [power-saving.md](../app/power-saving.md). This page is how to find out what it is worth, and what is open per system. Nothing in the numbers section below is measured yet: the saving was built from what the code does (a wake-up costs power, so fewer of them cost less) and tested for its behaviour, not for its watts.

## Method

Run each case for 10 minutes on battery, with the window open and no other app, once with the mode `never` and once with `always` (Settings, Save power), and compare:

1. Idle, nothing plays, a library of at least a few thousand songs.
2. Playing a FLAC, the window hidden or minimised.
3. Scanning (Rescan), and a measurement of the loudness that goes on.

Per system:

- **Linux:** `sudo powertop` (the wake-ups per second and the power estimate of the process), or `sudo turbostat --quiet --interval 10` for the package power. Close what else is running; read the main process and the renderer processes of `tunelle` together.
- **macOS:** the Energy Impact column of Activity Monitor, with the Average Energy Impact of `Tunelle` and its helper processes.
- **Windows:** Task Manager, the "Power usage" and "Power usage trend" columns.

The power source comes from `powerMonitor` events on Windows and macOS, and from `/sys/class/power_supply` on Linux, which Electron has no events for; the state is up to 10 seconds late there. A computer without a battery is never on battery, so `auto` never saves; `always` still does.

## Open per system

| System | State | To check |
|---|---|---|
| Linux | the code is done, tested with mocks | measure the three cases above; unplug the charger with the app open and watch the line "Saving power now" of the settings change within 10 seconds |
| macOS | not checked | the events of `powerMonitor`; the numbers above |
| Windows | not checked | the events of `powerMonitor`; the numbers above |

A system that needs its own source of the power state (a laptop whose `powerMonitor` is wrong) adds it in `electron/power/power-state.ts` next to the events, and nothing else changes, as the rest of the app asks `savingPower()`.

## The audit of the issue

| Candidate | Result |
|---|---|
| Polling of the folders, recheck of a drive, loudness | done, see power-saving.md |
| 5 fps time of the track when the window is hidden or minimised | done: no timer while the page is hidden (`client/audio/context.ts`) |
| Bars of the spectrum when the window is hidden | done: not drawn (the loop still runs at its own pace) |
| `backgroundThrottling: false` while the window is hidden and nothing plays | open: the main process does not know whether something plays, and Chromium may keep an audible page unthrottled; needs the playing state in the main process and a check with `e2e/support/audio.ts` that a gapless change still happens |
| Progress of the loudness and the background tasks while the window is not visible | open: the messages are small, measure first |
| Concurrency of the scan and the reader pool (`directoriesInFlight`) | open: a lower number is a slower scan, not less work, so it needs the measurement of the scan case |
| Idle timers of the main process | found: the background queue looks for work every 2 s (`createTaskQueue`'s `pause`) even when nothing waits; it could wake only on a change, or wait longer while power is saved. Open, to be filed |
| Hardware acceleration and the decode path | open: needs the measurement of playing a FLAC and of a format that Chromium cannot play |
