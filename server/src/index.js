import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { isProd, PORT, GOOGLE, SMTP, CORS_ORIGINS, CORS_ALLOW_VERCEL } from './config/env.js';
import { buildOriginAllowlist } from './utils/corsOrigin.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { log } from './utils/logger.js';
import { metricsMiddleware } from './services/metrics.js';

import authRouter    from './routes/auth.js';
import betRouter     from './routes/bet.js';
import walletRouter  from './routes/wallet.js';
import profileRouter from './routes/profile.js';
import supportRouter from './routes/support.js';
import adminAuthRouter      from './routes/admin/auth.js';
import adminDashboardRouter from './routes/admin/dashboard.js';
import adminUsersRouter     from './routes/admin/users.js';
import adminBetsRouter      from './routes/admin/bets.js';
import adminSportsRouter    from './routes/admin/sports.js';
import adminPromosRouter    from './routes/admin/promotions.js';
import adminStatsRouter     from './routes/admin/stats.js';
import adminProvidersRouter from './routes/admin/providers.js';
import adminNotificationsRouter from './routes/admin/notifications.js';
import adminDepositsRouter  from './routes/admin/deposits.js';
import adminSettingsRouter  from './routes/admin/settings.js';
import adminSupportRouter   from './routes/admin/support.js';
import { initStores } from './db/store.js';
import { getSettings } from './db/settings.js';
import { PROMOTIONS } from './matchesData.js';
import { startSettlementLoop } from './services/settlement.js';
import { attachRealtime } from './services/realtime.js';
import { startAggregator, startLiveTrack } from './services/oddsAggregator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false, // SPA + Vite dev needs inline; revisit when serving prod build with hashed assets
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // required by Google Identity Services popup
  crossOriginResourcePolicy: { policy: 'cross-origin' },           // allow Google's button assets
}));
// Shared predicate — also reused by realtime.js for Socket.IO so the two
// transports always agree on what's allowed (including Vercel preview URLs
// when CORS_ALLOW_VERCEL is set).
const isAllowedOrigin = buildOriginAllowlist({
  isProd,
  allowedOrigins: CORS_ORIGINS,
  vercelProject: CORS_ALLOW_VERCEL,
});
app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    // Reject without throwing (cb(null, false)) so the browser gets a clean
    // CORS error instead of a confusing 500 with no CORS headers.
    log.warn(`CORS: rejecting origin ${origin}. Add it to CORS_ORIGIN if it's a legitimate frontend.`);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '256kb' }));
app.use(metricsMiddleware);
app.use(generalLimiter);

/** Logs every HTTP request (method, path, status, duration). */
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log[level](`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'xenbet-api',
    version: '1.0.0',
    google: GOOGLE.enabled,
    smtp: SMTP.enabled,
    env: isProd ? 'production' : 'development',
  });
});

app.get('/api/settings/public', (_req, res) => {
  const s = getSettings();
  res.json({ maintenance: s.maintenance, maintenanceMessage: s.maintenanceMessage, signupsOpen: s.signupsOpen, minDeposit: s.minDeposit, minWithdraw: s.minWithdraw });
});

app.use('/api/auth',     authRouter);
app.use('/api/bet',      betRouter);
app.use('/api/wallet',   walletRouter);
app.use('/api/profile',  profileRouter);
app.use('/api/support',  supportRouter);

app.use('/api/admin/auth',          adminAuthRouter);
app.use('/api/admin/dashboard',     adminDashboardRouter);
app.use('/api/admin/users',         adminUsersRouter);
app.use('/api/admin/bets',          adminBetsRouter);
app.use('/api/admin/sports',        adminSportsRouter);
app.use('/api/admin/promotions',    adminPromosRouter);
app.use('/api/admin/stats',         adminStatsRouter);
app.use('/api/admin/providers',     adminProvidersRouter);
app.use('/api/admin/notifications', adminNotificationsRouter);
app.use('/api/admin/deposits',      adminDepositsRouter);
app.use('/api/admin/settings',      adminSettingsRouter);
app.use('/api/admin/support',       adminSupportRouter);

app.use('/api', notFoundHandler);

if (isProd) {
  const dist = path.join(__dirname, '../../client/dist');
  try {
    fs.accessSync(dist, fs.constants.R_OK);
    app.use(express.static(dist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(dist, 'index.html'), (err) => err && next(err));
    });
  } catch {
    logger.warn(`client/dist not found at ${dist} — skipping client serving`);
  }
}

app.use(errorHandler);

const server = http.createServer(app);
attachRealtime(server);

async function boot() {
  // Load every KV store (Postgres or JSON files) into memory so that
  // synchronous get/set in route handlers is safe.
  await initStores();

  // Re-register open bets in the cash-out engine so offers work after restart.
  try {
    const { createStore } = await import('./db/store.js');
    const { registerBet } = await import('./services/cashOutEngine.js');
    const betsStore = createStore('bets', {});
    for (const bet of Object.values(betsStore.all() || {})) {
      if (bet.status === 'open') registerBet(bet);
    }
  } catch (e) {
    log.warn('Could not rebuild cash-out engine state:', e.message);
  }

  // Sweep expired refresh tokens every 15 minutes.
  try {
    const { sweepExpiredTokens } = await import('./services/token.js');
    await sweepExpiredTokens(); // immediate first pass
    setInterval(() => sweepExpiredTokens().catch((e) => log.warn('token sweep error:', e.message)), 15 * 60_000);
  } catch (e) {
    log.warn('Could not start token sweep:', e.message);
  }

  // Seed one super admin from env vars if no admins exist (dev only).
  if (!isProd) {
    const { seedAdmins } = await import('./db/seedAdmins.js');
    await seedAdmins();
  }

  await new Promise((resolve) => server.listen(PORT, resolve));
  log.info(`Xenbet API listening on http://127.0.0.1:${PORT}`);

  try {
    startSettlementLoop();
    startAggregator();
    startLiveTrack();
    // Jackpot settlement tick.
    const { settleJackpotEntries } = await import('./routes/bet.js');
    settleJackpotEntries().catch(() => {});
    setInterval(() => settleJackpotEntries().catch((e) => log.warn('jackpot settle error:', e.message)), 60_000);
  } catch (e) {
    log.error('post-boot error', e?.message || e);
  }
}

boot().catch((e) => {
  log.error('boot failed:', e?.stack || e);
  process.exit(1);
});
