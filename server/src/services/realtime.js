/**
 * Realtime backbone.
 *
 * Two namespaces:
 *   /live   — player-facing. Token optional. Rooms: 'fixture:<id>',
 *             'sport:<id>', 'user:<id>' (when authed).
 *   /admin  — admin-only. Token required and scope=admin. Rooms: 'global',
 *             'provider:<id>'.
 *
 * Server -> client events (/live):
 *   odds:tick      { key, fixtureId, market, selections: [{ key, label, odds, direction }], sport?, provider? }
 *   odds:movement  { key, fixtureId, market, selection, prev, next }
 *   score:update   { fixtureId, scoreHome, scoreAway, minute, sport?, eventKind?, team? }
 *   match:event    { fixtureId, kind, minute, scoreHome, scoreAway, team?, ts }  // emitted only on real events
 *   live:snapshot  { fixtureId, scoreHome, scoreAway, minute, markets, ts }      // sent to a single socket on subscribe
 *   bet:settled    { betId, status, payout }                                     // user room only
 *   bet:won        { betId, payout }                                             // user room only
 *   wallet:update  { balance, delta, reason }                                    // user room only
 *   cashout:offer  { betId, cashOut, potentialWin, ts, reason? }                 // user room only
 *
 * Server -> client events (/admin):
 *   audit:event       Audit log row
 *   provider:health   Provider snapshot
 *   bet:placed        New bet
 *   bet:settled       Settled bet (any user)
 *   kpi:tick          Lightweight KPI delta (online users, etc.)
 *   cashout:executed  { betId, userId, cashOut, ts }
 *
 * Client -> server commands:
 *   /live   subscribe   { fixtureIds: string[], sportIds: string[] }
 *   /live   unsubscribe { fixtureIds: string[], sportIds: string[] }
 *   /admin  subscribe   { providers?: string[] }
 */
import { Server as IOServer } from 'socket.io';
import { verifyAccessToken } from './token.js';
import { getUserById } from '../db/users.js';
import { isProd, CORS_ORIGINS, CORS_ALLOW_VERCEL } from '../config/env.js';
import { buildOriginAllowlist } from '../utils/corsOrigin.js';
import { log } from '../utils/logger.js';

let io = null;
let liveNs = null;
let adminNs = null;

// Track sockets per user / per admin for monitoring
const liveByUser = new Map();   // userId -> Set<socket>
const adminSockets = new Set();

// Per-fixture rolling snapshot of the last known live state. Pushed to
// reconnecting sockets when they re-join a fixture room, so the UI has
// something to render before the next tick arrives.
const liveSnapshots = new Map(); // fixtureKey -> { fixtureId, scoreHome, scoreAway, minute, markets, ts }

function updateSnapshot(fixtureKey, patch) {
  const prev = liveSnapshots.get(fixtureKey) || {};
  const next = { ...prev, ...patch, ts: Date.now() };
  liveSnapshots.set(fixtureKey, next);
  return next;
}

export function attachRealtime(httpServer) {
  if (io) return io;
  // Use the same allowlist function as Express CORS so HTTP + WebSocket
  // origins are validated identically (including Vercel preview wildcards).
  const isAllowedOrigin = buildOriginAllowlist({
    isProd,
    allowedOrigins: CORS_ORIGINS,
    vercelProject: CORS_ALLOW_VERCEL,
  });
  io = new IOServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: (origin, cb) => {
        if (isAllowedOrigin(origin)) return cb(null, true);
        return cb(new Error(`CORS: origin ${origin} not allowed`), false);
      },
      credentials: true,
    },
    pingInterval: 25_000,
    pingTimeout: 60_000,
    transports: ['websocket', 'polling'],
  });

  liveNs  = io.of('/live');
  adminNs = io.of('/admin');

  // --- /live namespace (player site) ---------------------------------------
  liveNs.use((socket, next) => {
    const token = pickToken(socket);
    socket.data.user = null;
    if (token) {
      try {
        const claims = verifyAccessToken(token);
        if (claims.scope === 'user' || !claims.scope) {
          const u = getUserById(claims.sub);
          if (u && !u.suspended) socket.data.user = u;
        }
      } catch { /* anonymous, still allowed */ }
    }
    next();
  });

  liveNs.on('connection', (socket) => {
    const user = socket.data.user;
    if (user) {
      socket.join(`user:${user.id}`);
      const set = liveByUser.get(user.id) || new Set();
      set.add(socket);
      liveByUser.set(user.id, set);
    }

    socket.emit('ready', { authenticated: !!user, ts: Date.now() });

    socket.on('subscribe', (payload = {}) => {
      const { fixtureIds = [], sportIds = [] } = payload;
      for (const id of fixtureIds.slice(0, 200)) {
        socket.join(`fixture:${id}`);
        // Send the current snapshot (if any) to *this socket only* — late
        // joiners get state before the next tick.
        const snap = liveSnapshots.get(id);
        if (snap) socket.emit('live:snapshot', snap);
      }
      for (const id of sportIds.slice(0, 10)) socket.join(`sport:${id}`);
    });

    socket.on('unsubscribe', (payload = {}) => {
      const { fixtureIds = [], sportIds = [] } = payload;
      for (const id of fixtureIds) socket.leave(`fixture:${id}`);
      for (const id of sportIds)   socket.leave(`sport:${id}`);
    });

    socket.on('disconnect', () => {
      if (user) {
        const set = liveByUser.get(user.id);
        if (set) { set.delete(socket); if (set.size === 0) liveByUser.delete(user.id); }
      }
    });
  });

  // --- /admin namespace ----------------------------------------------------
  adminNs.use((socket, next) => {
    const token = pickToken(socket);
    if (!token) return next(new Error('admin token required'));
    try {
      const claims = verifyAccessToken(token);
      if (claims.scope !== 'admin') return next(new Error('not an admin token'));
      const u = getUserById(claims.sub);
      if (!u || u.role !== 'admin' || u.suspended) return next(new Error('admin not active'));
      socket.data.admin = u;
      socket.data.adminClaims = claims;
      return next();
    } catch (e) {
      return next(new Error('invalid admin session'));
    }
  });

  adminNs.on('connection', (socket) => {
    adminSockets.add(socket);
    socket.join('global');
    socket.emit('ready', { admin: socket.data.admin.email, role: socket.data.admin.adminRole, ts: Date.now() });

    socket.on('subscribe', (payload = {}) => {
      const { providers = [] } = payload;
      for (const id of providers) socket.join(`provider:${id}`);
    });

    socket.on('disconnect', () => { adminSockets.delete(socket); });
  });

  log.info('Realtime: Socket.IO attached on /socket.io (namespaces /live and /admin)');
  return io;
}

function pickToken(socket) {
  return (
    socket.handshake.auth?.token ||
    socket.handshake.query?.token ||
    socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
    null
  );
}

/* ------------------------------------------------------------------ *
 *  Emit helpers used throughout the server. No-ops before attach so
 *  modules can import these unconditionally.
 * ------------------------------------------------------------------ */

export function emitOddsTick(payload) {
  if (!liveNs) return;
  const fixtureId = payload.fixtureId || payload.key;
  const room = `fixture:${fixtureId}`;

  // Normalize selections without mutating the caller's payload.
  const selections = Array.isArray(payload.selections)
    ? payload.selections.map((s) => ({ ...s, direction: s.direction || 'same' }))
    : payload.selections;
  const out = selections === payload.selections ? payload : { ...payload, selections };

  // Merge this market's selections into the rolling snapshot.
  if (fixtureId && payload.market) {
    const prev = liveSnapshots.get(fixtureId);
    const markets = { ...(prev?.markets || {}), [payload.market]: selections };
    updateSnapshot(fixtureId, { fixtureId, markets });
  }

  liveNs.to(room).emit('odds:tick', out);
  if (payload.sport) liveNs.to(`sport:${payload.sport}`).emit('odds:tick', out);
}

export function emitOddsMovement(payload) {
  if (!liveNs) return;
  liveNs.to(`fixture:${payload.fixtureId}`).emit('odds:movement', payload);
  if (adminNs) adminNs.to('global').emit('odds:movement', payload);
}

export function emitScoreUpdate(payload) {
  if (!liveNs) return;
  // Snapshot first so reconnects get the latest score.
  if (payload.fixtureId) {
    updateSnapshot(payload.fixtureId, {
      fixtureId: payload.fixtureId,
      scoreHome: payload.scoreHome,
      scoreAway: payload.scoreAway,
      minute: payload.minute,
    });
  }
  liveNs.to(`fixture:${payload.fixtureId}`).emit('score:update', payload);
  if (payload.sport) liveNs.to(`sport:${payload.sport}`).emit('score:update', payload);

  // Promote a meaningful state change into a separate match:event so the UI
  // can fire the ribbon animation independently of the score pulse.
  if (payload.eventKind) {
    const ev = {
      fixtureId: payload.fixtureId,
      kind: payload.eventKind,
      minute: payload.minute,
      scoreHome: payload.scoreHome,
      scoreAway: payload.scoreAway,
      team: payload.team,
      ts: Date.now(),
    };
    liveNs.to(`fixture:${payload.fixtureId}`).emit('match:event', ev);
  }
}

export function emitToUser(userId, event, payload) {
  if (!liveNs || !userId) return;
  liveNs.to(`user:${userId}`).emit(event, payload);
}

/** Push a cash-out offer to a specific user's room. */
export function emitCashoutOffer(userId, payload) {
  if (!liveNs || !userId) return;
  liveNs.to(`user:${userId}`).emit('cashout:offer', payload);
}

export function emitAdmin(event, payload) {
  if (!adminNs) return;
  adminNs.to('global').emit(event, payload);
}

/** Broadcast to every connected player socket. */
export function emitAll(event, payload) {
  if (!liveNs) return;
  liveNs.emit(event, payload);
}

export function emitProviderHealth(snapshot) {
  if (!adminNs) return;
  adminNs.to('global').emit('provider:health', snapshot);
}

export function realtimeStats() {
  return {
    attached: !!io,
    livePlayers: liveByUser.size,
    liveSockets: liveNs ? liveNs.sockets.size : 0,
    adminSockets: adminSockets.size,
  };
}
