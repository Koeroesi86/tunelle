# Developing and building

| Command                     | Purpose                                                                       |
| :-------------------------- | :---------------------------------------------------------------------------- |
| `npm run dev`               | Start development server                                                      |
| `MOCK_UPDATE=1 npm run dev` | Development server with a mocked update on the splash (nothing is installed)  |
| `npm run build`             | Compile the app to `/out` and `/build`                                        |
| `npm run typecheck`         | Type-check the whole project                                                  |
| `npm run dist`              | Build for current OS                                                          |

`npx tsx scripts/checks/verify.ts` runs the checks of [CLAUDE.md](../../CLAUDE.md) in order and prints only the end of the one that failed.

## Environment variables

- `TUNELLE_NO_UPDATE=1` turns the updater off (see [updater.md](../app/updater.md)).
- `TUNELLE_RADIO_DIRECTORY=<url>` replaces the station directory. The smoke tests set both variables, the second to a station of their own.
- `TUNELLE_LOUDNESS_IDLE_SECONDS=<seconds>` is how long no folder must have been scanned before the loudness of the library is measured in the background (30 by default, see [loudness-measurement.md](../app/loudness-measurement.md)). The end to end test of the measurement sets it to 0.
- `TUNELLE_APP_DATA=<folder>` replaces the app data folder, where the library lives. The end to end tests set it to the profile of the run: on macOS and Windows the app data folder does not follow `HOME`, and a test would use the library of the user.

## The `@shared` import alias

Code in `shared/` (used by `electron/` and `client/`) is imported as `@shared/utils/wait`, not with `../../shared/...`. It is set in four places: `paths` in `tsconfig.json`, `resolve.alias` in `scripts/tooling/config/webpack.config.base.js`, `alias` in `vitest.config.ts`, and, because `tsc` leaves the alias in the compiled files of the main process and node can not resolve it, `scripts/tooling/alias-paths.js`, which `scripts/tooling/tsc.js` runs over `out/` after every emit and which turns `@shared/x` into a relative path. A new alias needs the same four places.

## Scripts in TypeScript

The scripts that only developers and the Claude hooks run (`scripts/checks/verify.ts`, `ci-failure.ts`, `docs-check.ts`, `perf-profile.ts` and the two modules `perf-library.ts` and `screenshot-media.ts` they use, `screenshot-fixtures.ts`) and the tests of every script are TypeScript, started with `npx tsx scripts/<name>.ts` (`tsx` is a dev dependency) and checked by `npm run typecheck` (`tsconfig.scripts.json`). The scripts that the workflows run (`version.js`, `store-submission.js`, `merge-update-files.js`, `flatpak-repo.js`, `build-site.js` and the others) and the build (`tsc.js`, `build.js`, `postinstall.js`) stay JavaScript: several workflows run them with plain `node` and no `npm ci`, so they must not need `tsx`. A script that a workflow runs, or that another JavaScript script requires, is not converted.
