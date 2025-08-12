const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const dataDirectoryPath = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDirectoryPath)) {
  fs.mkdirSync(dataDirectoryPath, { recursive: true });
}

const databaseFilePath = path.join(dataDirectoryPath, 'game.db');
const db = new sqlite3.Database(databaseFilePath);

db.serialize(() => {
  // Check if current_world column exists and migrate if needed
  db.get("PRAGMA table_info(users)", (err, rows) => {
    if (err) {
      console.error('Error checking table schema:', err);
      return;
    }
    
    db.all("PRAGMA table_info(users)", (err, columns) => {
      if (err) {
        console.error('Error getting table schema:', err);
        return;
      }
      
      const hasCurrentWorld = columns.some(col => col.name === 'current_world');
      const hasCurrentRealm = columns.some(col => col.name === 'current_realm');
      
      if (hasCurrentWorld && !hasCurrentRealm) {
        console.log('Migrating database: current_world -> current_realm');
        db.run("ALTER TABLE users RENAME COLUMN current_world TO current_realm", (err) => {
          if (err) {
            console.error('Migration failed:', err);
            // Fallback: recreate table
            console.log('Attempting table recreation...');
            db.run("DROP TABLE users", (err) => {
              if (err) console.error('Drop table failed:', err);
              createUsersTable();
            });
          } else {
            console.log('Migration successful');
          }
        });
      } else if (!hasCurrentRealm) {
        // Table doesn't exist or missing column, create it
        createUsersTable();
      } else {
        console.log('Database schema is up to date');
      }
    });
  });
});

function createUsersTable() {
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      x_position REAL,
      y_position REAL,
      current_realm TEXT,
      gear_data TEXT
    )`,
    (err) => {
      if (err) {
        console.error('Error creating users table:', err);
      } else {
        console.log('Users table created successfully');
      }
    }
  );
}

function getUser(username) {
  return new Promise((resolve, reject) => {
      db.get(
    'SELECT username, x_position, y_position, current_realm, gear_data FROM users WHERE username = ?',
      [username],
      (error, row) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(row || null);
      }
    );
  });
}

function saveUser(userRecord) {
  const gearDataJson =
    typeof userRecord.gear_data === 'string'
      ? userRecord.gear_data
      : JSON.stringify(userRecord.gear_data || {});

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (username, x_position, y_position, current_realm, gear_data)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET
         x_position = excluded.x_position,
         y_position = excluded.y_position,
         current_realm = excluded.current_realm,
         gear_data = excluded.gear_data`,
      [
        userRecord.username,
        userRecord.x_position,
        userRecord.y_position,
        userRecord.current_realm,
        gearDataJson,
      ],
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }
    );
  });
}

module.exports = {
  db,
  getUser,
  saveUser,
};


