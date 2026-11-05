# Developing and building

| Command                     | Purpose                                                                       |
| :-------------------------- | :---------------------------------------------------------------------------- |
| `npm run dev`               | Start development server                                                      |
| `MOCK_UPDATE=1 npm run dev` | Development server with a mocked update on the splash (nothing is installed)  |
| `npm run build`             | Compile the app to `/out` and `/build`                                        |
| `npm run typecheck`         | Type-check the whole project                                                  |
| `npm run dist`              | Build for current OS                                                          |

`node scripts/verify.js` runs the checks of [CLAUDE.md](../CLAUDE.md) in order and prints only the end of the one that failed.

## Environment variables

- `TUNELLE_NO_UPDATE=1` turns the updater off (see [updater.md](updater.md)).
- `TUNELLE_RADIO_DIRECTORY=<url>` replaces the station directory. The smoke tests set both variables, the second to a station of their own.
- `TUNELLE_APP_DATA=<folder>` replaces the app data folder, where the library lives. The end to end tests set it to the profile of the run: on macOS and Windows the app data folder does not follow `HOME`, and a test would use the library of the user.
