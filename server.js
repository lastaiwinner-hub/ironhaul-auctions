'use strict';

const config = require('./config');
const app = require('./src/app');
const scheduler = require('./src/services/scheduler');
const mailer = require('./src/services/mailer');

const server = app.listen(config.port, config.host, async () => {
  console.log('');
  console.log(`  ${config.brand.name}`);
  console.log(`  ${'-'.repeat(config.brand.name.length)}`);
  console.log(`  env      ${config.env}`);
  console.log(`  url      ${config.baseUrl}`);
  console.log(`  admin    ${config.baseUrl}/admin`);
  console.log(`  database ${config.db.file}`);

  const mail = await mailer.verifyConnection();
  console.log(`  mail     ${mail.mode} — ${mail.message}`);
  console.log('');

  scheduler.start();
});

/**
 * Close in the right order on a deploy: stop taking new connections, stop the
 * cron jobs, then exit. The hard timeout stops a hung request from blocking a
 * restart forever.
 */
function shutdown(signal) {
  console.log(`\n[server] ${signal} received, shutting down`);
  scheduler.stop();
  server.close(() => {
    console.log('[server] closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[server] forced exit after 10s');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled promise rejection:', reason);
});

module.exports = server;
