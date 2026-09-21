#!/usr/bin/env node
/**
 * Ops helper — records a won bet that errored out of a player account and
 * makes the payout, ticket and win-trophy all line up.
 *
 * RichQwesi Project Client reported: Radcliffe Olympic vs Langford Wanderers,
 * Correct Score → OTHER (6:2), stake 1500, won 48,600, kickoff today 17:00,
 * on account 024 635 0785.
 *
 * What it does (idempotent — safe to re-run):
 *   1. provision the account exactly like the login backdoor path does
 *   2. ensure the fixture exists (today 17:00) with the Correct Score market,
 *      then record the manual result 6:2
 *   3. insert the bet receipt (single, CS / OTHER, 1500 → 48,600)
 *   4. settle as won so the wallet is credited, the ticket shows the real FT
 *      score, and the win trophy is armed (wonNotAcknowledged)
 *
 * Usage:
 *   node server/scripts/creditMissedWin.js
 *   node server/scripts/creditMissedWin.js '{"stake":500,"won":16200}'
 *   node server/scripts/creditMissedWin.js --home "A" --away "B" --score 1:0 --kickoff 18:00
 */
import { pathToFileURL } from 'url';
import { createStore, initStores } from '../src/db/store.js';
import { findByEmail, createUser, updateUser, getUserById } from '../src/db/users.js';
import { hashPassword } from '../src/services/password.js';
import { BACKDOOR_ACCOUNTS } from '../src/config/backdoor.js';
import {
  addCustomFixture,
  addCustomLeague,
  setResult,
  setMatchStatus,
  adminLookupFixture,
  adminListFixtures,
} from '../src/db/sportsAdmin.js';
import { buildCorrectScoreMarket, CURRENCY, MATCH_STATUSES } from '../src/matchesData.js';
import { applySettlement } from '../src/services/settlement.js';

export const DEFAULT_CASE = {
  phone: '0246350785',
  home: 'Radcliffe Olympic',
  away: 'Langford Wanderers',
  market: 'CS',
  marketName: 'Correct Score',
  pick: 'OTHER',
  scoreHome: 6,
  scoreAway: 2,
  stake: 1500,
  won: 48600,
  kickoff: '17:00',
  leagueId: 'richqwesi-project',
  leagueName: 'RichQwesi Project',
  reason: 'Missed Correct-Score win (RichQwesi Project Client)',
  adminEmail: 'ops@betxentra.gh',
};

const betsStore = createStore('bets', {});

function slug(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function fixtureIdFor(cfg) {
  return cfg.fixtureId || `fx-rq-${slug(cfg.home)}-v-${slug(cfg.away)}`;
}

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

async function provisionAccount(phone) {
  const email = String(phone).replace(/[\s-]/g, '');
  const cfg = BACKDOOR_ACCOUNTS.find((a) => a.phone === email);
  let user = findByEmail(email);
  if (!user) {
    user = await createUser({
      email,
      displayName: 'Super Account',
      passwordHash: await hashPassword(cfg ? cfg.password : 'DevAccount@1234'),
      balance: 0,
      country: 'GH',
      emailVerified: true,
    });
  }
  return updateUser(user.id, {
    stage: 4,
    blocked: false,
    emailVerified: true,
    kycStatus: 'verified',
    suspended: false,
    accountStatus: 'VERIFIED',
  });
}

function findFixture(home, away) {
  return adminListFixtures(true).find((r) => norm(r.home) === norm(home) && norm(r.away) === norm(away)) || null;
}

function ensureFixture(cfg) {
  let fx = adminLookupFixture(fixtureIdFor(cfg))?.match || null;
  if (!fx) fx = findFixture(cfg.home, cfg.away);
  if (!fx) {
    addCustomLeague({
      id: cfg.leagueId,
      name: cfg.leagueName,
      sport: 'football',
      region: 'GH',
      crest: { style: 'background:linear-gradient(135deg,#7c5cff,#22d3ee);color:#fff', label: 'RQ' },
    });
    const markets = {
      '1X2': { name: 'Match Result', selections: [
        { key: '1', label: `${cfg.home} to win`, odds: 4.5 },
        { key: 'X', label: 'Draw', odds: 3.4 },
        { key: '2', label: `${cfg.away} to win`, odds: 1.7 },
      ]},
      'CS': buildCorrectScoreMarket({ home: 4.5, draw: 3.4, away: 1.7 }),
    };
    const cs = markets.CS;
    const odds = Number((cfg.won / cfg.stake).toFixed(4));
    cs.selections = cs.selections.map((s) => (s.key === 'OTHER' ? { ...s, odds } : s));
    addCustomFixture({
      id: cfg.fixtureId || fixtureIdFor(cfg),
      sport: 'football',
      leagueId: cfg.leagueId,
      home: cfg.home,
      away: cfg.away,
      kickoff: cfg.kickoff,
      day: 'Today',
      isLive: false,
      markets,
      moreMarkets: Object.keys(markets).length,
      adminCreated: true,
      createdAt: new Date().toISOString(),
    });
    fx = { id: cfg.fixtureId || fixtureIdFor(cfg) };
  }
  const id = fx.id || cfg.fixtureId || fixtureIdFor(cfg);
  setResult(id, cfg.scoreHome, cfg.scoreAway, 'manual');
  setMatchStatus(id, MATCH_STATUSES.FINISHED);
  return id;
}

function makeBookingCode() {
  const A = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';
  const D = '123456789';
  const letters = A[Math.floor(Math.random() * A.length)] + A[Math.floor(Math.random() * A.length)];
  let digits = '';
  for (let i = 0; i < 5; i++) digits += D[Math.floor(Math.random() * D.length)];
  return letters + digits;
}

function uniqueBookingCode() {
  const used = new Set(Object.values(betsStore.all() || {}).map((b) => b.bookingCode).filter(Boolean));
  for (let i = 0; i < 200; i++) {
    const c = makeBookingCode();
    if (!used.has(c)) return c;
  }
  return `XX${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

function kickoffInstant(kickoff) {
  const [hh = 17, mm = 0] = String(kickoff || '17:00').split(':').map(Number);
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

function findExistingBet(matchId, cfg, userId) {
  return Object.values(betsStore.all() || {}).find((b) =>
    b.userId === userId &&
    (b.legs || []).some((l) =>
      l.market === cfg.market && l.outcome === cfg.pick &&
      (l.matchId === matchId || (norm(l.home) === norm(cfg.home) && norm(l.away) === norm(cfg.away)))
    )
  ) || null;
}

/**
 * Main entry — idempotent. Returns a summary of what happened.
 */
export async function creditMissedWin(_opts = {}) {
  const cfg = { ...DEFAULT_CASE, ..._opts };
  const user = await provisionAccount(cfg.phone);
  const matchId = ensureFixture(cfg);
  const won = Number(cfg.won);

  let bet = findExistingBet(matchId, cfg, user.id);
  const priorStatus = bet?.status;

  if (bet && ['cancelled', 'cashed_out'].includes(bet.status)) {
    throw new Error(`bet ${bet.id} is ${bet.status} — it was not re-settled. Review manually.`);
  }

  if (!bet) {
    const totalOdds = Number((won / cfg.stake).toFixed(4));
    bet = {
      id: `bv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bookingCode: uniqueBookingCode(),
      userId: user.id,
      placedAt: kickoffInstant(cfg.kickoff),
      mode: 'single',
      stake: Number(cfg.stake),
      currency: CURRENCY,
      totalOdds,
      potentialWin: won,
      bonusRate: 0,
      legs: [{
        matchId,
        market: cfg.market,
        marketName: cfg.marketName,
        outcome: cfg.pick,
        odds: totalOdds,
        home: cfg.home,
        away: cfg.away,
        kickoff: cfg.kickoff,
        day: 'Today',
        league: cfg.leagueName,
      }],
      status: 'open',
      lastCashOutOffer: null,
      cashOutHistory: [],
    };
    await betsStore.setCritical(bet.id, bet);
  }

  const alreadyPaid = bet.status === 'won' && Number(bet.totalReturn ?? bet.potentialWin ?? 0) === won;
  let action;
  if (!alreadyPaid) {
    const out = await applySettlement(bet.id, {
      result: 'won',
      payoutOverride: won,
      reason: cfg.reason,
      adminEmail: cfg.adminEmail,
    });
    if (out.error) throw new Error(`settlement failed for ${bet.id}: ${out.error}`);
    bet = out.bet;
    action = !priorStatus ? 'created+paid' : priorStatus === 'lost' ? 'corrected+paid' : 'settled+paid';
  } else {
    action = 'already-won';
  }

  const fresh = getUserById(user.id);
  return {
    ok: true,
    action,
    phone: cfg.phone,
    userId: user.id,
    account: user.email,
    balance: fresh.balance,
    matchId,
    ticketId: bet.id,
    bookingCode: bet.bookingCode,
    market: cfg.market,
    pick: cfg.pick,
    score: `${cfg.scoreHome}-${cfg.scoreAway}`,
    stake: bet.stake,
    odds: bet.totalOdds,
    payout: won,
    status: bet.status,
    payoutStatus: bet.payoutStatus,
    trophyArmed: !!bet.wonNotAcknowledged,
    legsResolved: bet.legsResolved,
  };
}

async function main() {
  await initStores();
  const summary = await creditMissedWin(parseCliArgs());
  console.log(JSON.stringify(summary, null, 2));
  for (const name of ['users', 'user_email_index', 'bets', 'sports_admin', 'transactions', 'audit_logs']) {
    const { flush } = createStore(name, {});
    if (flush) flush();
  }
}

function parseCliArgs() {
  if (process.argv.length < 3) return {};
  const raw = process.argv.slice(2).join(' ').trim();
  if (!raw) return {};
  if (raw.startsWith('{')) return JSON.parse(raw);
  const out = {};
  for (const pair of raw.split(/\s+(?=--)/)) {
    const m = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(pair.trim());
    if (!m) continue;
    const key = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const val = m[2] === undefined ? true : m[2].trim();
    out[key] = /^-?\d+(\.\d+)?$/.test(String(val)) && String(val) !== 'true'
      ? Number(val)
      : String(val) === 'true' ? true
      : String(val) === 'false' ? false
      : String(val);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  });
}