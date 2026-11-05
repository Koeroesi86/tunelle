import type { Database } from 'sqlite3';
import type { Query } from '@shared/types/library';

function executeQuery<T = unknown>(db: Database, query: Query): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(query.query, query.variables, (err, result: T[]) => {
      if (err) {
        reject(err.message);
      } else {
        resolve(result);
      }
    });
  });
}

export default executeQuery;
