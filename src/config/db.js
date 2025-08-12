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
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      x_position REAL,
      y_position REAL,
      current_world TEXT,
      gear_data TEXT
    )`
  );
});

function getUser(username) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT username, x_position, y_position, current_world, gear_data FROM users WHERE username = ?',
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
      `INSERT INTO users (username, x_position, y_position, current_world, gear_data)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET
         x_position = excluded.x_position,
         y_position = excluded.y_position,
         current_world = excluded.current_world,
         gear_data = excluded.gear_data`,
      [
        userRecord.username,
        userRecord.x_position,
        userRecord.y_position,
        userRecord.current_world,
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


