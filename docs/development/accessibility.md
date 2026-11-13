# Accessibility checks

Two automated checks show the accessibility problems of the renderer (tracking issue #317). Both only warn until the issue is done, so the problems stay visible on every run; then they become errors.

## Lint: `eslint-plugin-jsx-a11y`

- The recommended rules run on `client/**/*.tsx` (not on tests) in `npm run lint`, with every rule set to `warn` in `eslint.config.js`. `npm run lint` prints them and still passes.
- To turn them into errors, change `'warn'` to `'error'` in that block once the warnings are gone.
- The plugin lists ESLint up to 9 as its peer, and the app is on 10: `overrides` in `package.json` points its peer at our ESLint. The rules work; remove the override once the plugin supports 10.

## axe in the end to end tests

- `e2e/accessibility.spec.ts` opens the library, album details, now playing, radio, settings and the equalizer in light and dark mode (`colorScheme` and reduced motion emulated) and runs axe on the page. Run it with `npm run test:a11y` after `npm run build`; CI runs it in `test:e2e`.
- Only serious and critical violations are reported. Each is an `accessibility warning` annotation of the test (in the HTML report) and a `[accessibility]` line in the log. The test does not fail on them; to make it fail, assert that the list is empty in the spec.
- Symptom: `browserContext.newPage: Protocol error (Target.createTarget): Not supported`. Cause: axe opens a second page by default, which Electron cannot. `setLegacyMode()` in `e2e/support/accessibility.ts` runs it in the page itself.
- The pages of the app stay mounted, so the scenes see the same page-wide violations for now.
