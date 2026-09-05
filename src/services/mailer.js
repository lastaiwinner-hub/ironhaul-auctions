'use strict';

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const config = require('../../config');
const { db } = require('../../config/database');
const { nowIso } = require('./dates');

let transport = null;

/**
 * With SMTP configured we send for real. Without it we still render and record
 * every message, writing it to logs/mail as an .eml file — so the whole
 * agreement and bidding flow can be exercised end to end before credentials
 * exist, and nothing silently no-ops.
 */
function getTransport() {
  if (transport) return transport;

  if (config.mail.enabled && config.mail.host) {
    transport = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
    });
  } else {
    fs.mkdirSync(config.mail.outboxDir, { recursive: true });
    transport = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    });
    transport.__fileOutbox = true;
  }
  return transport;
}

function logRow({ to, subject, template, relatedType, relatedId }) {
  return Number(db.prepare(`
    INSERT INTO email_log (to_email, subject, template, related_type, related_id, status)
    VALUES (?, ?, ?, ?, ?, 'queued')
  `).run(to, subject, template, relatedType || null, relatedId || null).lastInsertRowid);
}

function markSent(id, messageId) {
  db.prepare(`
    UPDATE email_log SET status = 'sent', message_id = ?, sent_at = ?,
           attempts = attempts + 1 WHERE id = ?
  `).run(messageId || null, nowIso(), id);
}

function markFailed(id, error) {
  db.prepare(`
    UPDATE email_log SET status = 'failed', error = ?, attempts = attempts + 1
     WHERE id = ?
  `).run(String(error && error.message ? error.message : error).slice(0, 500), id);
}

/**
 * Send one message. Never throws: a failed notification must not roll back the
 * bid or signature that triggered it. Failures land in email_log for retry.
 */
async function send({
  to, subject, html, text, template = 'generic',
  attachments = [], relatedType = null, relatedId = null, replyTo,
}) {
  const logId = logRow({ to, subject, template, relatedType, relatedId });

  const message = {
    from: `"${config.mail.fromName}" <${config.mail.fromEmail}>`,
    to,
    subject,
    html,
    text: text || htmlToText(html),
    replyTo: replyTo || config.mail.replyTo,
    attachments,
  };

  try {
    const tx = getTransport();
    const info = await tx.sendMail(message);

    if (tx.__fileOutbox) {
      const safe = String(subject).replace(/[^a-z0-9]+/gi, '-').slice(0, 60);
      const file = path.join(
        config.mail.outboxDir,
        `${Date.now()}-${logId}-${safe}.eml`
      );
      fs.writeFileSync(file, info.message);
      markSent(logId, `file:${path.basename(file)}`);
      console.log(`[mail] (no SMTP configured) wrote ${path.basename(file)} -> ${to}`);
      return { ok: true, logId, file };
    }

    markSent(logId, info.messageId);
    console.log(`[mail] sent "${subject}" -> ${to}`);
    return { ok: true, logId, messageId: info.messageId };
  } catch (err) {
    markFailed(logId, err);
    console.error(`[mail] FAILED "${subject}" -> ${to}:`, err.message);
    return { ok: false, logId, error: err };
  }
}

/** Re-attempt anything that failed fewer than 3 times. Driven by the scheduler. */
async function retryFailed(limit = 20) {
  const rows = db.prepare(`
    SELECT * FROM email_log WHERE status = 'failed' AND attempts < 3
     ORDER BY created_at LIMIT ?
  `).all(limit);
  // The original body is not retained, so retry is a hook for an operator-
  // driven resend rather than an automatic one; surface the backlog instead.
  return rows;
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function verifyConnection() {
  if (!config.mail.enabled || !config.mail.host) {
    return { ok: false, mode: 'file-outbox', message: 'No SMTP host configured; messages are written to logs/mail.' };
  }
  try {
    await getTransport().verify();
    return { ok: true, mode: 'smtp', message: `Connected to ${config.mail.host}:${config.mail.port}` };
  } catch (err) {
    return { ok: false, mode: 'smtp', message: err.message };
  }
}

module.exports = { send, retryFailed, verifyConnection, htmlToText };
