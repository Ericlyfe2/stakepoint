import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = process.env;

export const isProd = env.NODE_ENV === 'production';

export const PORT = Number(env.PORT) || 4000;

export const JWT = {
  secret:    env.JWT_SECRET || 'dev-only-secret-change-me',
  accessTtl: env.JWT_ACCESS_TTL  || '15m',
  refreshTtl:env.JWT_REFRESH_TTL || '30d',
  issuer:    'xenbet',
};

export const SMTP = {
  host: env.SMTP_HOST || '',
  port: Number(env.SMTP_PORT) || 587,
  secure: env.SMTP_SECURE === 'true',
  user: env.SMTP_USER || '',
  pass: env.SMTP_PASS || '',
  from: env.SMTP_FROM || 'Xenbet <no-reply@xenbet.gh>',
  enabled: !!env.SMTP_HOST,
};

export const GOOGLE = {
  clientId:     env.GOOGLE_CLIENT_ID     || '',
  clientSecret: env.GOOGLE_CLIENT_SECRET || '',
  enabled: !!env.GOOGLE_CLIENT_ID,
};

export const RATE_LIMITS = {
  loginMax: Number(env.RATE_LIMIT_LOGIN_MAX) || 5,
  otpMax:   Number(env.RATE_LIMIT_OTP_MAX)   || 3,
};

export const ODDS_API_KEY = env.ODDS_API_KEY || '';

// Comma-separated list of allowed origins for CORS in production.
// Example: "https://stakepoint-client.vercel.app,https://www.example.com"
// In development, localhost is always allowed.
export const CORS_ORIGINS = (env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export const PATHS = {
  root: path.resolve(__dirname, '../..'),
  data: path.resolve(__dirname, '../../data'),
  clientDist: path.resolve(__dirname, '../../../client/dist'),
};

// ---- Live betting -----------------------------------------------------------
export const LIVE_BETTING = {
  // apiFootball API key for live odds & live scores. If empty, the live
  // track no-ops; pre-match polling continues normally.
  apiFootballKey: env.APIFOOTBALL_KEY || env.APIFOOTBALL_TOKEN || '',
  // Cadence of the live track, in ms. Lower bound 3000 to respect provider
  // rate limits. Default 6000.
  pollMs: Math.max(3000, Number(env.LIVE_POLL_MS) || 6000),
  // House margin applied to live cash-out offers (0–1).
  houseMargin: Math.min(0.5, Math.max(0, Number(env.CASHOUT_HOUSE_MARGIN) || 0.05)),
  // Maximum acceptable drift between the client's acceptedAmount and the
  // server's current offer (0–1). Default 1%.
  driftTolerance: Math.min(0.2, Math.max(0, Number(env.CASHOUT_DRIFT_TOLERANCE) || 0.01)),
};

if (!LIVE_BETTING.apiFootballKey) {
  // Informational, not blocking — the live track now activates against any
  // enabled football provider (see services/oddsAggregator.js startLiveTrack).
  // APIFOOTBALL provides the richest live data (minute counter, red-card
  // counts) so we still call it out, but the loop will run with whatever
  // provider is available.
  console.warn('[env] APIFOOTBALL_KEY not set — live track will run via other providers (no live minute/cards if they don\'t expose them).');
}

if (isProd && (!JWT.secret || JWT.secret === 'dev-only-secret-change-me' || JWT.secret.length < 32)) {
  console.error('[env] FATAL: JWT_SECRET must be set to a 32+ char random string in production.');
  process.exit(1);
}
if (isProd && CORS_ORIGINS.length === 0) {
  console.error('[env] FATAL: CORS_ORIGIN must list at least one allowed frontend origin in production.');
  process.exit(1);
}
if (!isProd && JWT.secret === 'dev-only-secret-change-me') {
  console.warn('[env] JWT_SECRET not set — using dev default. Override in .env for production.');
}
if (!SMTP.enabled) {
  console.warn('[env] SMTP not configured — OTP emails will print to the server console.');
}
if (!GOOGLE.enabled) {
  console.warn('[env] GOOGLE_CLIENT_ID not set — Google sign-in is disabled until you provide one.');
}
