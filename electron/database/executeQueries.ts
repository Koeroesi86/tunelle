import type { Database } from 'sqlite3';
import type { Query } from '@shared/types/library';
import executeQuery from './executeQuery';

function executeQueries<T = unknown>(db: Database, queries: Query[]): Promise<T[][]> {
  return Promise.all(queries.map((query) => executeQuery<T>(db, query)));
}

export default executeQueries;
