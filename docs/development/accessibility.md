# Accessibility checks

Two automated checks show the accessibility problems of the renderer (tracking issue #317). Both only warn until the issue is done, so the problems stay visible on every run; then they become errors.

## Lint: `eslint-plugin-jsx-a11y`

- The recommended rules run on `client/**/*.tsx` (not on tests) in `npm run lint`, with every rule set to `warn` in `eslint.config.js`. `npm run lint` prints them and still passes.
- To turn them into errors, change `'warn'` to `'error'` in that block once the warnings are gone.
- The plugin lists ESLint up to 9 as its peer, and the app is on 10: `overrides` in `package.json` points its peer at our ESLint. The rules work; remove the override once the plugin supports 10.

## axe in the end to end tests

- `e2e/accessibility/accessibility.spec.ts` opens the library, album details, now playing, radio, settings and the equalizer in light and dark mode (`colorScheme` and reduced motion emulated) and runs axe on the page. Run it with `npm run test:a11y` after `npm run build`. It is its own Playwright project (`a11y`), left out of `npm run test:e2e`, and CI runs it in the `accessibility` job of `test.yml` on Ubuntu only, beside the other jobs, so the end to end tests of every system stay as short as they are.
- Only serious and critical violations are reported. Each is a line `<rule>: <help> (<n> elements)` in the failure of the test, which fails on any. To see the elements, run axe with the rule in a temporary spec and print `node.target` and `node.any[0].message`.
- Symptom: axe `color-contrast`. Causes found: a `text-shadow` (axe counts the shadow colour as the background, so the navigation labels have none), `opacity` on text (use `--text-muted` or `--text-faint`), an overlay on the transparent title bar (the queue pill sits on `--panel-solid`), and the dense tint of a window that nothing blurs (the dark one is 0.8, as the desktop behind a transparent window is unknown and axe sees white). The muted and faint text and the accent tint are set in `ThemeProvider.scss` so that the accent on its tint and the faint text on a panel keep 4.5:1.
- Symptom: `browserContext.newPage: Protocol error (Target.createTarget): Not supported`. Cause: axe opens a second page by default, which Electron cannot. `setLegacyMode()` in `e2e/support/accessibility.ts` runs it in the page itself.
- The pages of the app stay mounted, so the scenes see the same page-wide violations for now.

## Keyboard and focus

- Anything that does something on a click is a `button` (navigation items, the views of the switcher, the title of an album tile), with `aria-current` on the current one. A row that opens and closes a group keeps its add button beside the toggle, not inside it (a button in a button is invalid).
- `:focus-visible` has one ring in the accent for what sets none of its own (`ThemeProvider.scss`, in `:where`, so a component can override it). Where the element clips its overflow, the component sets a negative `outline-offset`.
- The track list is a `grid`: Tab reaches one row (roving `tabindex`, the row that had the focus last, or the first shown), Enter plays, Space selects, and the arrows move to the row above and below. The list is windowed, so the arrows only reach rows that are rendered.
- The page of an album is a modal dialog (`role="dialog"`, `aria-modal`, named by the title). `use-dialog-focus.ts` moves the focus in, keeps Tab inside, and gives the focus back to the element that had it on close. Use it for any new dialog.
- Not done yet: arrow keys across album tiles, and the app-wide shortcuts (Space, seeking, volume, a skip link).

## Names, values and announcements

- Every control has an accessible name. An icon button has an `aria-label` (and a `title` for the tooltip), and the icon is `aria-hidden`. Shuffle and repeat are toggles and say so with `aria-pressed`.
- `Slider` takes a required `label` and an optional `valueText` (the seek bar reads `00:01:05 / 00:03:00`, the volume `50%`, a fader `+3 dB`). A range input without a name is read as an unnamed slider (axe `label`).
- Symptom: axe `label-content-name-mismatch`. Cause: an `aria-label` that does not contain the text the button shows, so a person who says the visible text to a voice control finds nothing. Either leave the `aria-label` out and let the text name the button (the sort chip), or put the extra words in a visually hidden `span` inside the button (the track area of the player, `visuallyHidden` in `PlayerControls.scss`).
- Symptom: axe `aria-required-parent`. Cause: a `columnheader` outside a `row` in a `table` (the header of the radio list). Give the header `role="row"` and its container `role="table"`.
- The player has a polite `role="status"` that is empty without a track and reads "Now playing: title by artist" when the track changes. Pausing does not change the text, so it is not announced again.
- Not done yet: announcements for radio errors and scan progress, the app-wide shortcuts, motion and zoom. Axe has no violation left on the six pages, so its test fails on a new one.
