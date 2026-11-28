# Mutation testing

`npm run test:mutation` runs [Stryker](https://stryker-mutator.io) on `client/audio/`, `client/domain/` and `client/loudness/`: it changes the code in small ways (a `>` to `>=`, an emptied string) and runs the frontend unit tests against each change. A change that no test fails on has "survived", which points at behaviour that is run but not checked. Coverage can not show that.

It is run by hand, and not in CI: the whole run took 18 minutes on 16 cores, so a runner of 4 would need about an hour, and a surviving mutant is a question for a person, not a failure. The report is in `reports/mutation/mutation.html`. One file or folder takes a few minutes:

```bash
npx stryker run --mutate 'client/domain/**/*.ts,!client/**/*.test.ts'
```

## What it takes to run

| Symptom | Cause | What is set |
| --- | --- | --- |
| `ts.parseConfigFileTextToJson is not a function` | Stryker rewrites the tsconfig with the JavaScript API, which TypeScript 7 does not have | `tsconfigFile` in `stryker.config.json` names a file that does not exist, which skips the step; Vitest does not read it |
| `Test timed out in 5000ms` in the first run of the tests | the instrumented code is many times slower, most in the reference signals of the loudness tests | `testTimeout` of 60 s in `vitest.mutation.config.ts` |
| the run would take every project of Vitest | the Vitest runner of Stryker has no choice of a project | `vitest.mutation.config.ts` has only the one of `vitest.frontend.ts` |
| errors for mutants of the builders of test files | `*-fixture.ts` of `client/loudness/slicing` is test code | left out of `mutate` |

Stryker 10.1.1 works with Vitest 5.0.5; its runner only declares `vitest >=2.0.0`, so check a new major version of Vitest by running it.

## First results

On 2026-11-28, 2,831 mutants, before any test was added for it:

| Folder | Score | Survived | Not covered |
| --- | --- | --- | --- |
| `client/audio` | 83.0% | 70 | 11 |
| `client/domain` | 84.0% | 74 | 1 |
| `client/loudness` | 77.0% | 360 | 70 |
| all | 79.2% | 504 | 82 |

The numbers of `loudness` include the two fixture builders that are now left out.

The clearest gaps got tests in the same change, which took `client/domain` to 93.6% and `gapless.ts` to 93.5%:

- the median of the starts of a track was only tested with starts that came in order, so the sort could be anything
- no test told a station that is exactly 8 s behind from one that is further
- no test said which saved views are read again (`navigation.ts`, 0%)
- the report of a playlist import was not checked when nothing was missing, or exactly as many entries as are named
- the key of a remote track did not have to change with its artist, album or live state

The lowest files left are `measure-webcodecs.ts`, `slice-mp3.ts`, `mp4-audio.ts` and `find-cut.ts`, all under 70%.

## Reading a result

- A score is not a goal. Some mutants change nothing that can be seen (a log text, an early return that only saves work): leave those.
- "Static" mutants (code that runs when a module loads) were 17% of all and took most of the time. `--ignoreStatic` skips them for a quick look.
- A survivor that shows a wrong behaviour gets a unit test; a fault it uncovers gets its own `bug` issue.
