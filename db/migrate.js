'use strict';
const { migrate } = require('../config/database');
migrate();
console.log('[migrate] schema applied');
