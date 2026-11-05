import sqlite3 from 'sqlite3';

function connectDatabase(libraryLocation: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const database: sqlite3.Database = new (sqlite3.verbose().Database)(libraryLocation, (err) => {
      if (err) {
        reject(err.message);
      } else {
        resolve(database);
      }
    });
  });
}

export default connectDatabase;
