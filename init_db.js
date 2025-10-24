const Database = require('better-sqlite3');
const path = require('path');
const dbPath = process.env.DB_PATH || path.join(__dirname,'..','data','voice_agent.db');
const db = new Database(dbPath);
db.exec(`
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  name TEXT,
  phone TEXT,
  date TEXT,
  time TEXT,
  party_size INTEGER,
  notes TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  name TEXT,
  phone TEXT,
  items TEXT,
  pickup_time TEXT,
  total REAL,
  created_at TEXT
);
`);
console.log('DB initialized at', dbPath);