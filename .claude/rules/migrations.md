---
paths:
  - "migrations/**"
  - "electron/database/**"
---

# Migrations

A new migration goes in `migrations/` as `NNN-name.sql` with the next number. Do not edit one that has shipped (`electron/database/migrations.checksums.test.ts` fails on it; a new migration gets its line in `electron/database/migrations-checksums.json`). Numbers start at 1 with no gap. Read [docs/app/migrations.md](docs/app/migrations.md) before adding one.
