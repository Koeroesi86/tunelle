# typescript-eslint and TypeScript 7

TypeScript 7 is the native compiler and has no JavaScript API in 7.0 (a new one is expected in 7.1). typescript-eslint imports `typescript` for that API and throws on version 7 (typescript-eslint#10940 tracks support), so lint runs on TypeScript 6.

- `typescript` is TypeScript 7: `tsc` for `npm run typecheck` and for the build of the main process (`scripts/tooling/tsc.js`).
- `typescript6` is the alias of `@typescript/typescript6`, the TypeScript 6 API.
- The first lines of `eslint.config.js` send every `require('typescript')` of the ESLint process to `typescript6`, before typescript-eslint is loaded. npm cannot give a peer dependency a private copy, so this is the way to give TypeScript 6 to typescript-eslint alone.
- `overrides` in `package.json` lets the peer range of `@typescript-eslint/eslint-plugin` and `parser` (`typescript <6.1.0`) accept the `typescript` of the project. Without it `npm ci` stops with ERESOLVE, as `npm install` only warns.

The hook patches `Module._load` of Node, which is not a public API. If lint fails with a TypeScript version error after an update, look there first.

When typescript-eslint supports TypeScript 7.1, remove the hook, the two `overrides`, the `typescript6` dependency and its `ignoreDependencies` entry in `.fallowrc.jsonc`.
