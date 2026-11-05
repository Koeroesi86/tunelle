# The performance summary of a pull request

`node scripts/checks/perf-summary.js <folder>` reads the artifacts of `.github/workflows/perf.yml`. The folder has a subfolder for each system:

- `perf-<system>` with the `perf-<name>.json` files that `npm run perf` writes for the pull request;
- `base-perf-<system>` with the same for the base branch, which are run first on the same runner.

The runs of `PERF_REPEAT` (`perf-<name>.json`, `perf-<name>.1.json`, ...) count as their median.

It prints the numbers that changed by a fifth or more on top (when the base was measured), then a collapsed markdown table for each file, a row for each number and a column for each system, with the base and the change in percent next to it when the base was measured. The numbers are measurements, not budgets.
