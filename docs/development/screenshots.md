# Screenshots of the website

The pictures in `site/screenshots/` are retaken, not edited: `npm run build` and then `npm run screenshots` (`npm run screenshots -- -g songs` takes one; `SCREENSHOTS_OUT=<folder>` writes elsewhere). Linux draws headless and needs no display, Windows and macOS need their desktop.

They are taken with the Playwright setup of `e2e/` (the `screenshots` project, `e2e/screenshots/scenes.shots.ts`), the same pictures every time, from made-up data only, which `scripts/screenshots/screenshot-fixtures.ts` writes:

- generated tagged FLAC files with drawn covers, no real artists, covers or stations;
- a fake station directory through `TUNELLE_RADIO_DIRECTORY` whose stream names its cover in `StreamUrl`, otherwise the app looks one up online and may show someone else's art;
- a clean profile (`HOME` and `XDG_CONFIG_HOME`), English, reduced motion, the colour scheme of the system, 1360×850, the pointer parked off the page, saved as WebP.

## A new picture

A new picture is a test in `e2e/screenshots/scenes.shots.ts`: the steps that click through the app, with the clock of the player held where the picture shows it, ending in `capture(page, name)`. The file it writes goes into `site/templates/index.html` (and its text into every `site/strings/*.json`), see [website.md](website.md).

The same setup takes the pictures of the layout at small sizes and checks them (`npm run screenshots -- small-windows`, not in CI), see [responsive-layout.md](responsive-layout.md).
