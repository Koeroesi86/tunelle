---
paths:
  - ".github/**"
---

# Workflows (`.github/`)

`scripts/checks/workflows.test.ts` checks the matrix, `fail-fast: false`, the check order, `permissions` and `continue-on-error`; `guard-bash.sh` blocks adding `continue-on-error`. What stays with you:

- `permissions` are minimal: wider only on the job that needs it (`release` needs `contents: write`), with a comment why. Never interpolate `${{ ... }}` of untrusted input into `run:`; pass it through `env:`.
- Keep the per-OS caches keyed on `package-lock.json`; do not share one cache between platforms.
- Dependabot waits 7 days before proposing a release; do not bump around it by hand.
