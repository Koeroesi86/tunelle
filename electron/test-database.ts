import sqlite3 from 'sqlite3';
import path from 'path';
import { migrate } from './database/migrate';

const migrationsPath = path.resolve(__dirname, '../migrations');

/** In-memory database with all migrations applied */
export const createTestDatabase = (): Promise<sqlite3.Database> =>
  new Promise<sqlite3.Database>((resolve, reject) => {
    const database = new sqlite3.Database(':memory:', (err) => (err ? reject(err) : resolve(database)));
  }).then((database) => migrate(database, migrationsPath).then(() => database));
