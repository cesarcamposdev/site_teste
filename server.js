'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const cfg = require('./src/config');
const audit = require('./src/audit');
const sessions = require('./src/sessions');
const { router: authRouter, requireAuth } = require('./src/auth');

const app = express();
const PUBLIC = path.join(__dirname, 'public');
const VIEWS = path.join(__dirname, 'views');

app.disable('x-powered-by');
app.set('trust proxy', false); // sem proxy: req.ip é o IP real da conexão

// ---- 1. Host header allowlist (anti DNS rebinding) ----
const hosts = [`localhost:${cfg.port}`, `127.0.0.1:${cfg.port}`, `[::1]:${cfg.port}`];
const allowedHosts = new Set(hosts);
const allowedOrigins = new Set(hosts.map((h) => `http://${h}`));
app.use((req, res, next) => {
  if (!allowedHosts.has(req.headers.host)) {
    audit.record(req, 'bad_host', { host: req.headers.host });
    return res.status(400).end();
  }
  next();
});

// ---- 2. Headers de segurança + CSP estrito ----
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],       // sem inline, sem eval
      styleSrc: ["'self'"],        // sem style inline
      imgSrc: ["'self'"],
      mediaSrc: ["'self'"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  strictTransportSecurity: cfg.cookieSecure ? undefined : false,
}));
app.use((req, res, next) => {
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

// ---- 3. Rate limiting ----
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => {
    audit.record(req, 'rate_limit_global');
    res.status(429).json({ error: 'Muitas requisições.' });
  },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => {
    audit.record(req, 'rate_limit_auth');
    res.status(429).json({ error: 'Muitas tentativas. Aguarde.', alert: audit.alertFor('rate_limit') });
  },
});
app.use(globalLimiter);

app.use(cookieParser());
app.use(express.json({ limit: '10kb', strict: true }));

// ---- Arquivos estáticos (sem listagem de diretório, sem dotfiles) ----
app.use(express.static(PUBLIC, { index: false, dotfiles: 'ignore', maxAge: '5m' }));

// ---- Sessão ----
app.use((req, res, next) => {
  const t = req.cookies[sessions.COOKIE_NAME];
  req.session = t ? sessions.load(t) : null;
  next();
});

// ---- 4. Honeypots: rotas-isca que nenhum usuário legítimo visitaria ----
const HONEY_ROUTES = ['/admin', '/administrator', '/wp-login.php', '/phpmyadmin', '/.env', '/.git/config', '/backup.sql'];
app.get(HONEY_ROUTES, (req, res) => {
  audit.record(req, 'honeypot_route');
  res.status(403).set('Cache-Control', 'no-store').sendFile(path.join(VIEWS, 'alert.html'));
});
app.get('/api/alert-config', (req, res) => res.json({ alert: audit.clientConfig() }));

// ---- 5. CSRF rotativo (token vinculado à sessão; troca a cada POST válido) ----
app.get('/api/csrf', (req, res) => {
  res.set('Cache-Control', 'no-store');
  let csrf;
  if (req.session) {
    csrf = req.session.csrf;
  } else {
    const s = sessions.create(null); // sessão anônima, só para o token CSRF
    res.cookie(sessions.COOKIE_NAME, s.token, sessions.cookieOpts);
    csrf = s.csrf;
  }
  res.json({ csrf, alert: audit.clientConfig() });
});

function csrfProtect(req, res, next) {
  res.set('Cache-Control', 'no-store');
  const fail = (reason) => {
    audit.record(req, 'csrf_fail', { reason });
    return res.status(403).json({ error: 'Falha de validação (CSRF).', code: 'CSRF' });
  };
  const origin = req.get('origin');
  if (origin && !allowedOrigins.has(origin)) return fail('origin');
  if (!req.is('application/json')) return res.status(415).json({ error: 'Content-Type inválido.' });
  if (!req.session) return fail('no_session');
  const sent = Buffer.from(String(req.get('x-csrf-token') || ''));
  const real = Buffer.from(req.session.csrf);
  if (sent.length !== real.length || !crypto.timingSafeEqual(sent, real)) return fail('token');

  // Token válido: rotaciona e injeta o novo na resposta JSON
  const next_csrf = sessions.rotateCsrf(req.session.idHash);
  const orig = res.json.bind(res);
  res.json = (body) => orig({ ...body, csrf: res.locals.csrf || next_csrf });
  next();
}

app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api', (req, res, next) => (req.method === 'POST' ? csrfProtect(req, res, next) : next()));
app.use('/api', authRouter);

// ---- Páginas ----
app.get('/', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  res.set('Cache-Control', 'no-store').sendFile(path.join(PUBLIC, 'index.html'));
});
app.get('/dashboard', (req, res) => {
  if (!req.session || !req.session.userId) return res.redirect('/');
  res.set('Cache-Control', 'no-store').sendFile(path.join(VIEWS, 'dashboard.html'));
});

// ---- 404 e erros (sem vazar stack trace) ----
app.use((req, res) => res.status(404).type('text/plain').send('Não encontrado'));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    audit.record(req, 'malformed_body', { type: err.type });
    return res.status(400).json({ error: 'Corpo inválido.' });
  }
  audit.record(req, 'server_error', { msg: String(err.message).slice(0, 100) });
  res.status(500).json({ error: 'Erro interno.' });
});

app.listen(cfg.port, cfg.host, () => {
  console.log(`Servidor em http://localhost:${cfg.port}  (escutando em ${cfg.host})`);
});
