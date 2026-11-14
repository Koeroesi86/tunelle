# Saving power

The app does background work that only matters when the computer is plugged in. While power is saved it does less of it, and goes back to the normal pace at once when the charger is back. Issue #340 has the plan; this page describes what is built.

## The state (`electron/power/`)

`power-state.ts` is the one place that asks for the power source. On Windows and macOS it reads `powerMonitor.isOnBatteryPower()` once at start and follows the `on-battery` and `on-ac` events, so nothing polls. Electron has no such events on Linux (`@platform darwin,win32` in its API), so there `linux-power-source.ts` reads `/sys/class/power_supply` at start and every 10 seconds: on battery means no `Mains` supply is online and a battery of the computer (not one with `scope` `Device`, as a mouse) discharges.

| Function | Meaning |
|---|---|
| `onBattery()` | the power source as the system tells it |
| `savingPower()` | whether the work is lowered: on battery in the mode `auto`, always in `always`, never in `never` |
| `onPowerSavingChange(listener)` | called with the new `savingPower()` when it changes; the function that comes back stops it |
| `applyPowerSetting(settings)` | follows the saved setting `powerSaving`; a missing or invalid one is `auto` |

The setting is in the settings page (Save power: On battery, Always, Never), saved as `powerSaving` and read by the main process like `watchFolders` (`readMainSettings`). The page is told the state with the message `POWER_SAVING` (`send-power-saving.ts`: at start, and with every change) and shows whether power is saved now.

Code that wants to lower its work calls `savingPower()` when it decides how long to wait, and `onPowerSavingChange` when it must act on the change. It never calls `powerMonitor` itself.

## What is lowered

| Work | While power is saved | When the charger is back |
|---|---|---|
| Polling of the library folders (`pollInterval`) | the wait and its shortest and longest value are 4 times as long (`powerSavingFactor` in `shared/constants/power.ts`): at least 40 s (`TUNELLE_WATCH_MIN_SECONDS` times 4), at most 60 min | all folders are looked at at once (`check(true)`, past the 30 s gap), so a change made while on battery is not missed |
| Recheck of a drive that is away (`client/redux/connection/middleware.ts`, `repeat`) | every 2 min instead of 30 s; the hourly rescan of an empty library is 4 hours | the window gets the focus or the next wait ends |
| Loudness measurement | only the track that plays now (`LOUDNESS_PRIORITISE` with `nowPlaying`), after the scan and idle conditions; the rest of the library and the tracks that are only queued wait | the queue is woken at once (`backgroundQueue.wake`), the pass goes on |
| The time of the track (5 per second) and the bars of the spectrum | not told or drawn while the window is hidden or minimised (this does not depend on the setting) | at the next `visibilitychange` |

Looking at the folders when the window gets the focus is not made longer: the user is there. A wait that was scheduled before the state changed ends at its old time, and the next one follows the new state, so a change takes effect after one look at most.

The loudness measurement used to stop on battery altogether, which left a track that plays without a measured gain for the whole time. The track that plays is the one the listener hears, so it is measured; the other tracks cost the same battery for no gain now.

## Measuring

How to measure what the app costs on battery, and what is left to check on each system, is in [battery.md](../development/battery.md).
