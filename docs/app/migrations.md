# Database migrations

A new migration goes in `migrations/` as `NNN-name.sql` with the next number. It runs once per library (the number is stored as `PRAGMA user_version`), so it may `ALTER TABLE`.

- Do not edit one that has shipped: `electron/migrations.checksums.test.ts` fails on it. A new migration gets its line in `electron/migrations-checksums.json`.
- Numbers start at 1 with no gap.
- `001` to `003` ran on every start before the number was stored, so they stay safe to run again.
- A migration runs in a transaction, so it cannot change `PRAGMA foreign_keys`, which SQLite ignores there.

## How `migrate` applies them (`electron/database/migrate.ts`)

It applies the migrations of the folder that the database has not seen, each one once and in the order of their number. A database that predates the version (0) gets all of them. A database that is ahead of the folder was opened by a newer app and is left alone (the library of a newer app is refused).

## The backup (`electron/database/backupLibrary.ts`)

The library is copied to `library.sqlite.v<N>.bak` before pending migrations run, as a migration that commits cannot be rolled back. A library with no table yet (a new one) has nothing to keep, so it is not copied. `VACUUM INTO` takes a consistent copy from the open connection, and a later copy of the same version replaces the earlier one.
