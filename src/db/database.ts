import Database from 'better-sqlite3';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../../data/portfolio.db');

// Ensure directory exists
import fs from 'fs';
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true } as any);
}

const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    qty INTEGER NOT NULL,
    avg_price REAL NOT NULL,
    side TEXT NOT NULL, -- 'BUY' or 'SELL'
    stop_loss REAL,
    target REAL,
    status TEXT DEFAULT 'OPEN', -- 'OPEN' or 'CLOSED'
    close_price REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS portfolio_summary (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    cash_balance REAL DEFAULT 1000000 -- Initial virtual cash: 10 Lakhs
  );

  INSERT OR IGNORE INTO portfolio_summary (id, cash_balance) VALUES (1, 1000000);
`);

export default db;
