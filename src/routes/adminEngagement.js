'use strict';
const router = require('express').Router();
const { db } = require('../../config/database');
const e = require('../services/engagement');
// Mounted after the existing admin authentication gate.
router.use((req,res,next) => { res.set('Cache-Control','no-store'); next(); });
router.get('/insights', (req,res) => res.render('admin/insights',{title:'Audience & analytics'}));
router.get('/inbox', (req,res) => res.render('admin/inbox',{title:'Live chat inbox'}));
router.get('/engagement/overview', (req,res) => res.json(e.snapshot([7,30,90].includes(Number(req.query.days)) ? Number(req.query.days) : 7)));
router.post('/engagement/presence', (req,res) => {
  db.prepare('INSERT INTO support_presence VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET last_seen=excluded.last_seen').run(req.user.id,req.body.online === false ? 0 : Date.now());
  res.json({ok:true});
});
router.get('/engagement/threads', (req,res) => {
  const status=['open','closed'].includes(req.query.status) ? req.query.status : 'open';
  const q=e.text(req.query.q,100);
  const rows=db.prepare("SELECT t.*, (SELECT body FROM support_messages WHERE thread_id=t.id ORDER BY id DESC LIMIT 1) preview FROM support_threads t WHERE status=? AND (name LIKE ? OR email LIKE ?) ORDER BY unread>0 DESC,updated_at DESC LIMIT 100").all(status,'%'+q+'%','%'+q+'%');
  res.json({threads:rows});
});
router.get('/engagement/threads/:id', (req,res) => {
  const t=db.prepare('SELECT * FROM support_threads WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({message:'Conversation no longer available.'});
  res.json({thread:t,messages:e.messages(t.id)});
});
router.post('/engagement/threads/:id/read', (req,res) => {
  const latest=db.prepare("SELECT MAX(id) n FROM support_messages WHERE thread_id=? AND sender='visitor'").get(req.params.id).n || 0;
  // Avoid clearing unread messages that arrived after the agent read the thread.
  if (Number(req.body.through)>=latest) db.prepare('UPDATE support_threads SET unread=0 WHERE id=?').run(req.params.id);
  res.json({ok:true});
});
router.post('/engagement/threads/:id/reply', (req,res) => {
  const t=db.prepare('SELECT id FROM support_threads WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({message:'Conversation no longer available.'});
  const body=e.text(req.body.message,2001), key=e.text(req.body.clientId,80);
  if (!body || body.length>2000 || !/^[\w-]{8,80}$/.test(key)) return res.status(400).json({message:'Enter 1–2,000 characters.'});
  const changes=e.addMessage(t.id,'team',body,key);
  if(changes) db.prepare("INSERT INTO activity_log(user_id,action,entity_type,detail) VALUES (?,'chat.reply','support',?)").run(req.user.id,t.id);
  res.json({ok:true,messages:e.messages(t.id)});
});
router.post('/engagement/threads/:id/status', (req,res) => {
  if (!['open','closed'].includes(req.body.status)) return res.status(400).json({message:'Invalid status.'});
  db.prepare('UPDATE support_threads SET status=? WHERE id=?').run(req.body.status,req.params.id);
  res.json({ok:true});
});
module.exports=router;
