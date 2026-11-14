# Accessibility checks

Two automated checks show the accessibility problems of the renderer (tracking issue #317). Both only warn until the issue is done, so the problems stay visible on every run; then they become errors.

## Lint: `eslint-plugin-jsx-a11y`

- The recommended rules run on `client/**/*.tsx` (not on tests) in `npm run lint`, with every rule set to `warn` in `eslint.config.js`. `npm run lint` prints them and still passes.
- To turn them into errors, change `'warn'` to `'error'` in that block once the warnings are gone.
- The plugin lists ESLint up to 9 as its peer, and the app is on 10: `overrides` in `package.json` points its peer at our ESLint. The rules work; remove the override once the plugin supports 10.

## axe in the end to end tests

- `e2e/accessibility/accessibility.spec.ts` opens the library, album details, now playing, radio, settings and the equalizer in light and dark mode (`colorScheme` and reduced motion emulated) and runs axe on the page. Run it with `npm run test:a11y` after `npm run build`. It is its own Playwright project (`a11y`), left out of `npm run test:e2e`, and CI runs it in the `accessibility` job of `test.yml` on Ubuntu only, beside the other jobs, so the end to end tests of every system stay as short as they are.
- Only serious and critical violations are reported. Each is an `accessibility warning` annotation of the test (in the HTML report) and a `[accessibility]` line in the log. The test does not fail on them; to make it fail, assert that the list is empty in the spec.
- Symptom: `browserContext.newPage: Protocol error (Target.createTarget): Not supported`. Cause: axe opens a second page by default, which Electron cannot. `setLegacyMode()` in `e2e/support/accessibility.ts` runs it in the page itself.
- The pages of the app stay mounted, so the scenes see the same page-wide violations for now.

## Keyboard and focus

- Anything that does something on a click is a `button` (navigation items, the views of the switcher, the title of an album tile), with `aria-current` on the current one. A row that opens and closes a group keeps its add button beside the toggle, not inside it (a button in a button is invalid).
- `:focus-visible` has one ring in the accent for what sets none of its own (`ThemeProvider.scss`, in `:where`, so a component can override it). Where the element clips its overflow, the component sets a negative `outline-offset`.
- The track list is a `grid`: Tab reaches one row (roving `tabindex`, the row that had the focus last, or the first shown), Enter plays, Space selects, and the arrows move to the row above and below. The list is windowed, so the arrows only reach rows that are rendered.
- The page of an album is a modal dialog (`role="dialog"`, `aria-modal`, named by the title). `use-dialog-focus.ts` moves the focus in, keeps Tab inside, and gives the focus back to the element that had it on close. Use it for any new dialog.
- Not done yet: arrow keys across album tiles, and the app-wide shortcuts (Space, seeking, volume, a skip link).
