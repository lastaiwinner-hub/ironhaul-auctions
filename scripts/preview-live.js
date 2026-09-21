'use strict';
// A disposable demo database keeps sample auction clocks separate from real data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlot-live-'));
const file = path.join(folder, 'preview.sqlite');
fs.copyFileSync(path.join(__dirname, '../db/demo.sqlite'), file);
const db = new Database(file);
require('../db/refreshDemo').refreshDemoClock(db);
db.close();
process.env.DATABASE_FILE = file;
process.env.DEMO_PREVIEW = 'true';
process.env.SCHEDULER_ENABLED = 'true';
process.env.MAIL_ENABLED = 'false';
process.env.PORT = process.env.PORT || '3101';
require('../server');
