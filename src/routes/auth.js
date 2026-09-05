'use strict';

const express = require('express');
const config = require('../../config');
const userModel = require('../models/user');
const mailer = require('../services/mailer');
const { templates } = require('../services/emailTemplates');
const { validate, passwordProblems } = require('../middleware/validate');
const { limiters, asyncRoute } = require('../middleware/common');

const router = express.Router();
const B = config.brand;

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/account');
  return res.render('pages/auth/register', {
    title: `Create your account — ${B.name}`,
    metaDescription: 'Register free in under a minute. No card required.',
    bodyClass: 'page-auth',
    values: {}, errors: {},
  });
});

router.post('/register', limiters.auth, asyncRoute(async (req, res) => {
  const { values, errors } = validate(req.body, {
    full_name: { required: true, label: 'Full name', minLength: 2, maxLength: 120 },
    email: { required: true, type: 'email', label: 'Email', maxLength: 200 },
    phone: { required: true, type: 'phone', label: 'Phone number' },
    company: { maxLength: 160 },
    password: { required: true, label: 'Password', maxLength: 200 },
    password_confirm: {
      required: true, label: 'Password confirmation',
      matches: 'password', matchMessage: 'The two passwords do not match.',
    },
    terms: { required: true, requiredMessage: 'You must accept the terms to register.' },
  });

  const problems = passwordProblems(req.body.password);
  if (problems.length && !errors.password) {
    errors.password = `Your password needs ${problems.join(', ')}.`;
  }
  if (!errors.email && userModel.emailExists(values.email)) {
    errors.email = 'An account already exists with that email address. Sign in instead.';
  }

  if (Object.keys(errors).length) {
    return res.status(400).render('pages/auth/register', {
      title: `Create your account — ${B.name}`,
      bodyClass: 'page-auth', values, errors,
    });
  }

  const { id, verifyToken } = await userModel.create({
    email: values.email,
    password: req.body.password,
    fullName: values.full_name,
    phone: values.phone,
    company: values.company || null,
  });

  const user = userModel.findById(id);
  const mail = templates.welcome({
    user, verifyUrl: `${config.baseUrl}/verify-email/${verifyToken}`,
  });
  await mailer.send({
    to: user.email, subject: mail.subject, html: mail.html,
    template: mail.template, relatedType: 'user', relatedId: id,
  });

  req.session.userId = id;
  req.flash('success', `Welcome aboard. We have emailed ${user.email} — confirm your address to continue.`);
  return res.redirect('/account/verify-email');
}));

// ---------------------------------------------------------------------------
// Login / logout
// ---------------------------------------------------------------------------

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/account');
  return res.render('pages/auth/login', {
    title: `Sign in — ${B.name}`,
    metaDescription: 'Sign in to bid, buy and manage your orders.',
    bodyClass: 'page-auth',
    values: {}, errors: {},
  });
});

router.post('/login', limiters.auth, asyncRoute(async (req, res) => {
  const { values } = validate(req.body, {
    email: { required: true, label: 'Email' },
    password: { required: true, label: 'Password' },
  });

  const user = userModel.findByEmail(values.email);

  // One message for both a missing account and a wrong password, so the form
  // cannot be used to discover which addresses are registered.
  const failed = () => res.status(401).render('pages/auth/login', {
    title: `Sign in — ${B.name}`,
    bodyClass: 'page-auth',
    values: { email: values.email },
    errors: { form: 'That email address and password do not match an account.' },
  });

  if (!user || !userModel.verifyPassword(user, req.body.password)) return failed();

  if (user.status === 'suspended') {
    return res.status(403).render('pages/auth/login', {
      title: `Sign in — ${B.name}`,
      bodyClass: 'page-auth',
      values: { email: values.email },
      errors: { form: `This account is suspended. Contact ${B.contact.email} for help.` },
    });
  }
  if (user.status === 'closed') return failed();

  // Rotate the session id on privilege change to shut down session fixation.
  return req.session.regenerate((err) => {
    if (err) throw err;
    req.session.userId = user.id;
    userModel.recordLogin(user.id, req.ip);

    const target = req.session.returnTo;
    delete req.session.returnTo;

    if (user.role === 'admin') return res.redirect(target || '/admin');
    return res.redirect(target || '/account');
  });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(config.session.name);
    res.redirect('/');
  });
});

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

router.get('/verify-email/:token', (req, res) => {
  const user = userModel.findByVerifyToken(req.params.token);
  if (!user) {
    req.flash('error', 'That confirmation link has expired. We can send you a new one.');
    return res.redirect(req.user ? '/account/verify-email' : '/login');
  }

  userModel.markEmailVerified(user.id);
  req.session.userId = user.id;
  req.flash('success', 'Email confirmed. Next: verify your identity to unlock bidding.');
  return res.redirect('/account/verification');
});

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

router.get('/forgot-password', (req, res) => {
  res.render('pages/auth/forgot-password', {
    title: `Reset your password — ${B.name}`,
    bodyClass: 'page-auth', values: {}, errors: {}, sent: false,
  });
});

router.post('/forgot-password', limiters.auth, asyncRoute(async (req, res) => {
  const { values, errors } = validate(req.body, {
    email: { required: true, type: 'email', label: 'Email' },
  });

  if (Object.keys(errors).length) {
    return res.status(400).render('pages/auth/forgot-password', {
      title: `Reset your password — ${B.name}`,
      bodyClass: 'page-auth', values, errors, sent: false,
    });
  }

  const user = userModel.findByEmail(values.email);
  if (user && user.status === 'active') {
    const token = userModel.createResetToken(user.id);
    const mail = templates.passwordReset({
      user, resetUrl: `${config.baseUrl}/reset-password/${token}`,
    });
    await mailer.send({
      to: user.email, subject: mail.subject, html: mail.html,
      template: mail.template, relatedType: 'user', relatedId: user.id,
    });
  }

  // Always render the same confirmation, whether or not the address exists.
  return res.render('pages/auth/forgot-password', {
    title: `Reset your password — ${B.name}`,
    bodyClass: 'page-auth', values, errors: {}, sent: true,
  });
}));

router.get('/reset-password/:token', (req, res) => {
  const user = userModel.findByResetToken(req.params.token);
  if (!user) {
    req.flash('error', 'That reset link has expired. Request a new one.');
    return res.redirect('/forgot-password');
  }
  return res.render('pages/auth/reset-password', {
    title: `Choose a new password — ${B.name}`,
    bodyClass: 'page-auth', token: req.params.token, errors: {},
  });
});

router.post('/reset-password/:token', limiters.auth, asyncRoute(async (req, res) => {
  const user = userModel.findByResetToken(req.params.token);
  if (!user) {
    req.flash('error', 'That reset link has expired. Request a new one.');
    return res.redirect('/forgot-password');
  }

  const errors = {};
  const problems = passwordProblems(req.body.password);
  if (problems.length) errors.password = `Your password needs ${problems.join(', ')}.`;
  if (req.body.password !== req.body.password_confirm) {
    errors.password_confirm = 'The two passwords do not match.';
  }

  if (Object.keys(errors).length) {
    return res.status(400).render('pages/auth/reset-password', {
      title: `Choose a new password — ${B.name}`,
      bodyClass: 'page-auth', token: req.params.token, errors,
    });
  }

  await userModel.setPassword(user.id, req.body.password);
  req.flash('success', 'Password updated. You can sign in now.');
  return res.redirect('/login');
}));

module.exports = router;
