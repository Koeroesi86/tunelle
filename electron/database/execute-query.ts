import { prettifyError, type ZodType, type z } from 'zod';
import type { Database } from 'sqlite3';
import type { Query } from '@shared/types/library';

const all = (db: Database, query: Query) =>
  new Promise<unknown[]>((resolve, reject) => {
    db.all(query.query, query.variables, (err, result: unknown[]) => (err ? reject(err.message) : resolve(result)));
  });

/** With a schema the rows are checked against it, a row of the wrong shape rejects with the fields that are wrong */
function executeQuery<S extends ZodType>(db: Database, query: Query, schema: S): Promise<z.output<S>[]>;
function executeQuery<T = unknown>(db: Database, query: Query): Promise<T[]>;
function executeQuery(db: Database, query: Query, schema?: ZodType): Promise<unknown[]> {
  return all(db, query).then((rows) =>
    rows.map((row) => {
      const result = schema?.safeParse(row) ?? { success: true as const, data: row };
      if (!result.success) throw new Error(`Unexpected row from "${query.query.trim().slice(0, 60)}":\n${prettifyError(result.error)}`);
      return result.data;
    })
  );
}

export default executeQuery;
