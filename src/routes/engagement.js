'use strict';
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { db } = require('../../config/database');
const e = require('../services/engagement');
const meta = require('../services/meta');
const config = require('../../config');
router.use((req,res,next) => { res.set('Cache-Control','no-store'); next(); });
router.use(rateLimit({ windowMs:60000, max:100, standardHeaders:true, legacyHeaders:false, message:{message:'Please wait a minute before trying again.'} }));
const sendLimit = rateLimit({windowMs:60000,max:15,standardHeaders:true,legacyHeaders:false,message:{message:'Please wait a minute before sending another message.'}});
const thread = req => db.prepare('SELECT id,status FROM support_threads WHERE id=?').get(req.session.supportId || '');
router.get('/state', (req,res) => {
  e.cleanup();
  const t = thread(req);
  const marketing = meta.allowed(req);
  res.json({marketingConsent:req.session.marketingConsent ?? null,marketing, pixelId:meta.enabled()?config.meta.pixelId:null,csrf:req.session.csrfToken, consent:req.session.analyticsConsent ?? null, online:e.online(),thread:t || null,messages:t ? e.messages(t.id) : []});
});
router.post('/consent', (req,res) => {
  req.session.analyticsConsent = req.body.accept === true && req.get('sec-gpc') !== '1' && req.get('dnt') !== '1';
  if (!req.session.analyticsConsent && req.session.audienceId) {
    db.prepare('DELETE FROM audience_visits WHERE id=?').run(req.session.audienceId);
    delete req.session.audienceId;
  }
  const marketing=meta.consent(req,req.body.marketing===true);
  res.json({ok:true,consent:req.session.analyticsConsent,marketing});
});
router.post('/meta-page',(req,res)=>res.json({events:meta.page(req)}));
router.post('/visit', (req,res) => {
  if (req.session.analyticsConsent !== true || req.user?.role === 'admin' || req.get('sec-gpc') === '1' || req.get('dnt') === '1') return res.status(204).end();
  e.track(req); res.json({ok:true});
});
router.post('/message', sendLimit, (req,res) => {
  const body = e.text(req.body.message,2001), key=e.text(req.body.clientId,80);
  if (!body || body.length>2000 || !/^[\w-]{8,80}$/.test(key)) return res.status(400).json({message:'Enter a message of 1–2,000 characters.'});
  let t = thread(req);
  if (!t) {
    const name=e.text(req.body.name,80),email=e.text(req.body.email,254);
    if (!name || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return res.status(400).json({message:'Enter your name and a valid email, or leave email blank.'});
    const id=crypto.randomUUID();
    const visit = db.prepare('SELECT source FROM audience_visits WHERE id=?').get(req.session.audienceId || '');
    db.prepare('INSERT INTO support_threads(id,name,email,page,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(id,name,email,e.publicPath(req.body.path),visit?.source || 'Unknown',Date.now(),Date.now());
    req.session.supportId=id; t={id};
  }
  e.addMessage(t.id,'visitor',body,key);
  res.json({ok:true,thread:{id:t.id,status:'open'},messages:e.messages(t.id),online:e.online()});
});
module.exports=router;
