import type { Database } from 'sqlite3';

/** Closes the database; it resolves either way, as it runs while the app quits and there is nothing left to do about a failure */
const closeDatabase = (database: Database): Promise<void> =>
  new Promise((resolve) =>
    database.close((err) => {
      if (err) console.error(err);
      resolve();
    })
  );

export default closeDatabase;
