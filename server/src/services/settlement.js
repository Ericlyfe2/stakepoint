/**
 * Auto-settlement engine.
 *
 * ONLY settles bets when fixtures have VERIFIED results (source: 'manual'
 * or 'feed'). Never generates simulated scores. If a fixture is marked
 * 'finished' but has no result, the engine waits — it does NOT fabricate
 * a score.
 *
 * The settlement loop runs every SETTLE_INTERVAL_MS. For every open bet
 * whose ALL legs reference fixtures with real results, it resolves each
 * leg, marks the bet won/lost/void, credits the wallet, pushes a
 * transaction, fires an audit event, and (on win) sets
 * wonNotAcknowledged so the storefront trophy modal can fire.
 *
 * Admins must set results manually via POST /fixtures/:id/result or via
 * a live results feed. No auto-simulation.
 */
import crypto from 'crypto';
import { createStore } from '../db/store.js';
import { getResult, adminLookupFixture, adminListFixtures } from '../db/sportsAdmin.js';
import { recordAudit } from '../db/audit.js';
import { updateUser, adjustBalance, getUserById, logActivity } from '../db/users.js';
import { log } from '../utils/logger.js';
import { emitToUser, emitAdmin, emitScoreUpdate } from './realtime.js';

const betsStore = createStore('bets', {});
const txStore   = createStore('transactions', {});

const SETTLE_INTERVAL_MS = 30_000;

let timer = null;

/* ------------ leg resolvers ------------ */

// Correct Score selection keys mirror db/markets.js's CS template — anything
// outside this list (e.g. 5-2) settles as 'OTHER'.
const CS_KNOWN_SCORES = new Set([
  '1-0', '2-0', '2-1', '3-0', '3-1', '3-2', '4-0', '4-1', '4-2', '4-3',
  '0-0', '1-1', '2-2', '3-3', '4-4',
  '0-1', '0-2', '1-2', '0-3', '1-3', '2-3', '0-4', '1-4', '2-4', '3-4',
]);
function csOutcome(scoreHome, scoreAway) {
  const key = `${scoreHome}-${scoreAway}`;
  return CS_KNOWN_SCORES.has(key) ? key : 'OTHER';
}

const FOOTBALL_OU_LINES = { OU05: 0.5, OU15: 1.5, OU25: 2.5, OU35: 3.5, OU45: 4.5 };

// NOTE: 1H1X2, 1HOU05, 1HBTTS and HTFT depend on the half-time score, which
// nothing in this codebase captures/persists on the result record — they
// fall through to the null return below and void (stake refunded) rather
// than settle on data we don't actually have.
export function legWon(leg, scoreHome, scoreAway) {
  const m = String(leg.market || '').toUpperCase();
  const o = String(leg.outcome || '');

  if (m === '1X2' || m === 'ML') {
    if (o === '1') return scoreHome > scoreAway;
    if (o === '2') return scoreAway > scoreHome;
    if (o === 'X') return scoreHome === scoreAway;
  }
  if (m === 'DC') {
    if (o === '1X') return scoreHome >= scoreAway;
    if (o === 'X2') return scoreAway >= scoreHome;
    if (o === '12') return scoreHome !== scoreAway;
  }
  if (m === 'DNB') {
    if (scoreHome === scoreAway) return null; // push on a draw -> void, stake refunded
    if (o === '1') return scoreHome > scoreAway;
    if (o === '2') return scoreAway > scoreHome;
  }
  if (m === 'BTTS') {
    const both = scoreHome > 0 && scoreAway > 0;
    if (o === 'Yes') return both;
    if (o === 'No')  return !both;
  }
  if (m in FOOTBALL_OU_LINES) {
    const total = scoreHome + scoreAway;
    const line = FOOTBALL_OU_LINES[m];
    if (o === 'Over')  return total > line;
    if (o === 'Under') return total < line;
  }
  if (m === 'TP') {
    const total = scoreHome + scoreAway;
    const line = Number(leg.line || 220.5);
    if (o === 'Over')  return total > line;
    if (o === 'Under') return total < line;
  }
  if (m === 'AH1') {
    // Whole-goal Asian handicap — an exact tie after the adjustment is a
    // push (void), not a win or loss for either side.
    if (o === 'H-1') {
      const adj = scoreHome - 1 - scoreAway;
      return adj === 0 ? null : adj > 0;
    }
    if (o === 'A+1') {
      const adj = scoreAway + 1 - scoreHome;
      return adj === 0 ? null : adj > 0;
    }
  }
  if (m === 'HCAP') {
    const hc = Number(leg.handicap || 0);
    if (o === '1H') return (scoreHome - hc) > scoreAway;
    if (o === '2H') return (scoreAway + hc) > scoreHome;
  }
  if (m === 'CS') {
    return csOutcome(scoreHome, scoreAway) === o;
  }
  if (m === 'WINBTTS') {
    const both = scoreHome > 0 && scoreAway > 0;
    const res = scoreHome > scoreAway ? '1' : scoreAway > scoreHome ? '2' : 'X';
    const map = { '1Y': res === '1' && both, '1N': res === '1' && !both, 'XY': res === 'X' && both, 'XN': res === 'X' && !both, '2Y': res === '2' && both, '2N': res === '2' && !both };
    if (o in map) return map[o];
  }
  if (m === 'WINOU25') {
    const total = scoreHome + scoreAway;
    const over = total > 2.5;
    const res = scoreHome > scoreAway ? '1' : scoreAway > scoreHome ? '2' : 'X';
    const map = { '1O': res === '1' && over, '1U': res === '1' && !over, 'XO': res === 'X' && over, 'XU': res === 'X' && !over, '2O': res === '2' && over, '2U': res === '2' && !over };
    if (o in map) return map[o];
  }
  return null; // unknown / HT-dependent market -> void leg, stake refunded
}

/* ------------ main tick ------------ */

function pushTx(userId, tx) {
  const id = `tx-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const entry = { id, userId, at: new Date().toISOString(), ...tx };
  const list = txStore.get(userId) || [];
  txStore.set(userId, [entry, ...list].slice(0, 500));
  return entry;
}

export async function settleNow() {
  const fixtures = adminListFixtures();

  const open = Object.values(betsStore.all() || {}).filter((b) => b.status === 'open');
  let settledWins = 0, settledLoss = 0, settledVoid = 0;
  for (const bet of open) {
    let allReady = true;
    const legResults = [];
    for (const leg of bet.legs || []) {
      const view = adminLookupFixture(leg.matchId);
      const sport = view?.sport?.id || view?.sport || 'football';
      const match = view?.match || view;
      // Only settle when there's a real authoritative result (manual or feed)
      const result = getResult(leg.matchId);
      if (!result || (result.source !== 'manual' && result.source !== 'feed')) {
        allReady = false;
        break;
      }
      // Use the persisted result scores
      const scoreHome = result.scoreHome;
      const scoreAway = result.scoreAway;
      const won = legWon(leg, scoreHome, scoreAway);
      legResults.push({ leg, res: result, won });
    }
    if (!allReady) continue;

    const anyVoid = legResults.some((r) => r.won === null);
    const allWon  = legResults.every((r) => r.won === true);
    const status  = anyVoid && legResults.every((r) => r.won !== false) ? 'void'
                  : allWon ? 'won' : 'lost';

    const user = getUserById(bet.userId);
    let credit = 0;
    if (status === 'won')  credit = bet.potentialWin;
    if (status === 'void') credit = bet.stake;
    const totalReturn = status === 'won' ? bet.potentialWin
                      : status === 'void' ? bet.stake
                      : 0;
    const updated = {
      ...bet,
      status,
      settledAt: new Date().toISOString(),
      settledBy: 'auto',
      totalReturn: Number((totalReturn || 0).toFixed(2)),
      legsResolved: legResults.map((r) => ({ matchId: r.leg.matchId, market: r.leg.market, outcome: r.leg.outcome, won: r.won, scoreHome: r.res.scoreHome, scoreAway: r.res.scoreAway })),
      ...(status === 'won' ? { wonNotAcknowledged: true } : {}),
    };
    betsStore.set(bet.id, updated);

    if (user && credit > 0) {
      const nextUser = await adjustBalance(user.id, credit, { allowNegative: true });
      pushTx(user.id, {
        kind: status === 'won' ? 'bet_won' : 'bet_void_refund',
        amount: credit, status: 'completed',
        balanceAfter: nextUser.balance, ref: bet.id,
      });
      logActivity(user.id, { kind: `bet_${status}`, betId: bet.id, credit });
      emitToUser(user.id, 'wallet:update', { balance: nextUser.balance, delta: credit, reason: `bet:${status}`, ref: bet.id });
    }
    // Push the leg results out as score updates for any clients watching the fixture
    for (const r of legResults) {
      emitScoreUpdate({
        fixtureId: r.leg.matchId,
        scoreHome: r.res.scoreHome,
        scoreAway: r.res.scoreAway,
        finished: true,
      });
    }
    emitToUser(bet.userId, 'bet:settled', { betId: bet.id, status, payout: credit });
    if (status === 'won') emitToUser(bet.userId, 'bet:won', { betId: bet.id, payout: credit, stake: bet.stake });
    emitAdmin('bet:settled', { betId: bet.id, status, userId: bet.userId, stake: bet.stake, credit });

    recordAudit({
      action: `bet.auto-settle.${status}`,
      target: bet.id,
      targetType: 'bet',
      severity: status === 'won' ? 'info' : 'info',
      meta: { stake: bet.stake, credit, legs: legResults.length, userId: bet.userId },
    });

    if (status === 'won')  settledWins++;
    if (status === 'lost') settledLoss++;
    if (status === 'void') settledVoid++;
  }
  return { settledWins, settledLoss, settledVoid };
}

export function startSettlementLoop() {
  if (timer) return;
  // first sweep on boot
  settleNow().catch((e) => log.error('settle initial', e?.message));
  timer = setInterval(async () => {
    try {
      const r = await settleNow();
      if (r.settledWins + r.settledLoss + r.settledVoid > 0) {
        log.info(`auto-settle ${r.settledWins}w / ${r.settledLoss}l / ${r.settledVoid}v`);
      }
    } catch (e) {
      log.error('settle tick', e?.message || e);
    }
  }, SETTLE_INTERVAL_MS);
}

export function stopSettlementLoop() {
  if (timer) clearInterval(timer);
  timer = null;
}
