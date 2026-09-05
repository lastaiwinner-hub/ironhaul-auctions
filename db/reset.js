'use strict';
const fs = require('fs');
const path = require('path');
const config = require('../config');

for (const suffix of ['', '-wal', '-shm']) {
  const f = config.db.file + suffix;
  if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('[reset] removed', path.basename(f)); }
}
for (const dir of [config.dirs.kyc, config.dirs.agreements, config.dirs.signatures]) {
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (f !== '.gitkeep') fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  }
}
console.log('[reset] done');
