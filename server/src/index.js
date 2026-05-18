import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import { isProd, PORT, GOOGLE, SMTP, CORS_ORIGINS } from './config/env.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { log } from './utils/logger.js';

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
import adminSettingsRouter  from './routes/admin/settings.js';
import adminSupportRouter   from './routes/admin/support.js';
import { seedAdmins } from './db/seedAdmins.js';
import { seedDemoData } from './db/seedDemo.js';
import { seedPromotionsIfEmpty } from './db/promotions.js';
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
const devOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = isProd ? CORS_ORIGINS : [...devOrigins, ...CORS_ORIGINS];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (!isProd && (origin.startsWith('http://localhost') || origin.startsWith('http://192.168.') || origin.startsWith('http://127.0.0.1'))) {
      return cb(null, true);
    }
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '256kb' }));
app.use(generalLimiter);

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
app.use('/api/admin/settings',      adminSettingsRouter);
app.use('/api/admin/support',       adminSupportRouter);

app.use('/api', notFoundHandler);

if (isProd) {
  const dist = path.join(__dirname, '../../client/dist');
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'), (err) => err && next(err));
  });
}

app.use(errorHandler);

const server = http.createServer(app);
attachRealtime(server);

async function boot() {
  // Load every KV store (Postgres or JSON files) into memory so that
  // synchronous get/set in route handlers is safe.
  await initStores();

  // Seeds depend on stores being loaded.
  await seedAdmins();
  await seedDemoData();
  const seeded = seedPromotionsIfEmpty((PROMOTIONS || []).map((p, i) => ({
    title: p.title || p.name || 'Offer',
    body: p.body || p.subtitle || '',
    badge: p.badge || 'OFFER',
    cta: p.cta || 'View',
    accent: p.accent || '#7c5cff',
    image: p.image || '',
    eligibility: 'all',
    bonusRate: p.bonusRate || 0,
    active: true,
    order: i,
  })));
  if (seeded) log.info(`Seeded ${seeded} promotions.`);

  await new Promise((resolve) => server.listen(PORT, resolve));
  log.info(`Xenbet API listening on http://127.0.0.1:${PORT}`);

  try {
    startSettlementLoop();
    startAggregator();
    startLiveTrack();
  } catch (e) {
    log.error('post-boot error', e?.message || e);
  }
}

boot().catch((e) => {
  log.error('boot failed:', e?.stack || e);
  process.exit(1);
});
