import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import executeQuery from '../../electron/database/execute-query';
import { migrate } from '../../electron/database/migrate';

// usage: tsx scripts/tooling/generate-database-schemas.ts
//        applies the migrations to a database in memory and writes a Zod schema of the rows of each table to electron/schemas/database/ (not in git)
//        See docs/development/validation.md
export interface Column {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

const root = path.resolve(__dirname, '../..');
const migrationsPath = path.resolve(root, 'migrations');
const outputPath = path.resolve(root, 'electron/schemas/database');

const header = `// Generated from the migrations by scripts/tooling/generate-database-schemas.ts (npm run generate:schemas), do not edit and do not commit\n`;

const camelCase = (name: string) => name.replace(/_(\w)/g, (_, letter: string) => letter.toUpperCase());

export const schemaNameOf = (table: string) => `${camelCase(table)}RowSchema`;

export const fileNameOf = (table: string) => `${table.replace(/_/g, '-')}.ts`;

/** The Zod type of the declared type of a column, by the affinity rules of SQLite (https://www.sqlite.org/datatype3.html#determination_of_column_affinity) */
export const zodTypeOf = (declared: string) => {
  const type = declared.toUpperCase();
  if (type.includes('INT')) return 'z.number()';
  if (/CHAR|CLOB|TEXT/.test(type)) return 'z.string()';
  if (type === '') return 'z.unknown()';

  return type.includes('BLOB') ? 'z.instanceof(Buffer)' : 'z.number()';
};

// a column of the primary key is never read as NULL by the app, a column that is not NOT NULL can hold it
const isNullable = ({ notnull, pk }: Column) => notnull === 0 && pk === 0;

const warnUntyped = (table: string, columns: Column[]) =>
  columns
    .filter(({ type }) => type === '')
    .forEach(({ name }) => console.warn(`${table}.${name} has no declared type, its schema is z.unknown(); give the column a type in its migration`));

export const generateTableSchema = (table: string, columns: Column[]) => {
  warnUntyped(table, columns);

  return `${header}import { z } from 'zod';

export const ${schemaNameOf(table)} = z.object({
${columns.map((column) => `  ${column.name}: ${zodTypeOf(column.type)}${isNullable(column) ? '.nullable()' : ''},`).join('\n')}
});
`;
};

const open = () =>
  new Promise<sqlite3.Database>((resolve, reject) => {
    const database = new sqlite3.Database(':memory:', (error) => (error ? reject(error) : resolve(database)));
  });

const close = (database: sqlite3.Database) => new Promise<void>((resolve, reject) => database.close((error) => (error ? reject(error) : resolve())));

/** The tables of the migrated schema with their columns, in the order of their names */
export const readTables = async () => {
  const database = await open();
  await migrate(database, migrationsPath);
  const tables = await executeQuery<{ name: string }>(database, {
    query: `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    variables: [],
  });
  const result = await Promise.all(
    tables.map(async ({ name }) => ({ name, columns: await executeQuery<Column>(database, { query: `PRAGMA table_info("${name}")`, variables: [] }) }))
  );
  await close(database);

  return result;
};

const write = async () => {
  const tables = await readTables();
  fs.rmSync(outputPath, { recursive: true, force: true });
  fs.mkdirSync(outputPath, { recursive: true });
  tables.forEach(({ name, columns }) => fs.writeFileSync(path.resolve(outputPath, fileNameOf(name)), generateTableSchema(name, columns)));
  console.log(`Generated the schemas of ${tables.length} tables.`);
};

if (require.main === module) {
  write().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
