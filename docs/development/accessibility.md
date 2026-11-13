# Accessibility checks

Two automated checks keep the renderer from getting worse while the known problems are fixed (tracking issue #317). Both start green from a baseline of what is there today, and the baselines only shrink.

## Lint: `eslint-plugin-jsx-a11y`

- The recommended rules run on `client/**/*.tsx` (not on tests) in `npm run lint`.
- `a11y-lint-baseline.json` maps a file to the rules that are turned off for it, as `eslint.config.js` reads it. Fix a violation, then remove the rule (or the file) from the list.
- The plugin lists ESLint up to 9 as its peer, and the app is on 10: `overrides` in `package.json` points its peer at our ESLint. The rules work; remove the override once the plugin supports 10.

## axe in the end to end tests

- `e2e/accessibility.spec.ts` opens the library, album details, now playing, radio, settings and the equalizer in light and dark mode (`colorScheme` and reduced motion emulated) and runs axe on the page. Run it with `npm run test:a11y` after `npm run build`; CI runs it in `test:e2e`.
- Only serious and critical violations count. Each is recorded as `<mode> <scene> <rule>` in `e2e/accessibility-baseline.json`. A violation that is not listed fails, and so does a listed one that is gone (remove it from the file).
- `UPDATE_A11Y_BASELINE=1 npm run test:a11y` rewrites the entries of the scenes that ran, for after a fix or a deliberate change.
- Symptom: `browserContext.newPage: Protocol error (Target.createTarget): Not supported`. Cause: axe opens a second page by default, which Electron cannot. `setLegacyMode()` in `e2e/support/accessibility.ts` runs it in the page itself.
- The pages of the app stay mounted, so the scenes see the same page-wide violations for now; the baseline gets finer as the pages are fixed.
