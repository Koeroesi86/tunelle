import sqlite3 from 'sqlite3';
import path from 'path';
import { migrate } from './database/migrate';

const migrationsPath = path.resolve(__dirname, '../migrations');

/** Database with all migrations applied: in memory, or in the file a test gives to open it again later */
export const createTestDatabase = (location = ':memory:'): Promise<sqlite3.Database> =>
  new Promise<sqlite3.Database>((resolve, reject) => {
    const database = new sqlite3.Database(location, (err) => (err ? reject(err) : resolve(database)));
  }).then((database) => migrate(database, migrationsPath).then(() => database));
