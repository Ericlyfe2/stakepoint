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
import { getResult } from '../db/sportsAdmin.js';
import { recordAudit } from '../db/audit.js';
import { adjustBalance, getUserById, logActivity } from '../db/users.js';
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

/**
 * Grades a bet against currently-recorded fixture results using legWon().
 * Shared by settleNow() (auto-settle open bets) and auditSettledBets()
 * (re-check already-settled bets against the current grading logic) so the
 * two can never disagree on what "correct" means.
 *
 * Returns null if any leg's fixture doesn't have a verified result yet.
 */
export function gradeBet(bet) {
  const legResults = [];
  for (const leg of bet.legs || []) {
    const result = getResult(leg.matchId);
    if (!result || (result.source !== 'manual' && result.source !== 'feed')) return null;
    const won = legWon(leg, result.scoreHome, result.scoreAway);
    legResults.push({ leg, res: result, won });
  }
  const anyVoid = legResults.some((r) => r.won === null);
  const allWon  = legResults.every((r) => r.won === true);
  const status  = anyVoid && legResults.every((r) => r.won !== false) ? 'void'
                : allWon ? 'won' : 'lost';
  return { status, legResults };
}

export async function settleNow() {
  const open = Object.values(betsStore.all() || {}).filter((b) => b.status === 'open');
  let settledWins = 0, settledLoss = 0, settledVoid = 0;
  for (const bet of open) {
    const graded = gradeBet(bet);
    if (!graded) continue;
    const { status, legResults } = graded;

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

/**
 * Re-checks every already-settled bet (won/lost/void — never cashed_out,
 * which pays out on a live offer rather than the original stake) against
 * legWon() as it stands *right now*, and reports any whose stored status
 * no longer matches. Exists because settleNow() only ever processes bets
 * that are still `open` — a bug fix to legWon() has zero effect on bets
 * that were already (mis-)graded and persisted before the fix shipped.
 *
 * Also flags bets whose overall status is already correct but whose
 * per-leg legsResolved record is stale — e.g. a bet corrected to "won"
 * before applySettlement() started rewriting legsResolved still has the
 * original mis-grade's `won: null` sitting there, and the client's ticket
 * page reads legsResolved before falling back to status, so it'd render a
 * red ✗ on a bet that pays out correctly. Same fix (re-run the correction)
 * resolves both categories, so both surface as one "mismatch" list.
 *
 * Read-only: does not change anything, so it's safe to run at any time.
 */
export function auditSettledBets() {
  const all = Object.values(betsStore.all() || {});
  const candidates = all.filter((b) => ['won', 'lost', 'void'].includes(b.status));
  const mismatches = [];

  for (const bet of candidates) {
    const graded = gradeBet(bet);
    if (!graded) continue; // a leg's fixture result vanished/changed since settlement — skip, don't guess
    const { status: correctStatus, legResults } = graded;

    const legsStale = correctStatus === bet.status && (bet.legsResolved || []).some((lr, i) => {
      const gr = legResults[i];
      return gr && lr.won !== gr.won;
    });
    if (correctStatus === bet.status && !legsStale) continue;

    const currentPayout = bet.settledPayout ?? bet.totalReturn ?? 0;
    const correctPayout = correctStatus === 'won' ? (bet.potentialWin || 0)
                         : correctStatus === 'void' ? (bet.stake || 0)
                         : 0;
    mismatches.push({
      betId: bet.id,
      bookingCode: bet.bookingCode,
      userId: bet.userId,
      legs: (bet.legs || []).map((l) => ({ matchId: l.matchId, home: l.home, away: l.away, market: l.market, outcome: l.outcome })),
      currentStatus: bet.status,
      correctStatus,
      legsStaleOnly: legsStale && correctStatus === bet.status,
      currentPayout: Number(currentPayout.toFixed(2)),
      correctPayout: Number(correctPayout.toFixed(2)),
      delta: Number((correctPayout - currentPayout).toFixed(2)),
      placedAt: bet.placedAt,
      settledAt: bet.settledAt,
    });
  }
  return { scanned: candidates.length, mismatches };
}

/**
 * Single authoritative "manually settle or correct a bet" implementation.
 * Both admin/bets.js and admin/settlement.js expose a settle-bet route —
 * they call this instead of each carrying their own copy, specifically so a
 * fix here can never apply to one route but not the other again.
 *
 * A bet already won/lost/void (never cashed_out — that pays out on a live
 * offer, not the stake) can be *corrected*: only the delta between what was
 * already paid and what the corrected result actually owes gets credited,
 * so this never double-pays. Corrections require a reason.
 *
 * Returns { ok: true, bet } on success, or { error: 'not_found' | 'cashed_out'
 * | 'reason_required' | 'bad_result' }.
 */
export async function applySettlement(betId, { result, reason, payoutOverride, adminEmail } = {}) {
  if (!['won', 'lost', 'void'].includes(result)) return { error: 'bad_result' };

  const bet = betsStore.get(betId);
  if (!bet) return { error: 'not_found' };
  if (bet.status === 'cashed_out') return { error: 'cashed_out' };

  const isCorrection = bet.status !== 'open';
  if (isCorrection && !reason?.trim()) return { error: 'reason_required' };

  const newCredit = result === 'won' ? (payoutOverride ?? bet.potentialWin ?? 0)
                   : result === 'void' ? (bet.stake || 0)
                   : 0;
  const previousCredit = isCorrection ? (bet.settledPayout ?? bet.totalReturn ?? 0) : 0;
  const delta = Number((newCredit - previousCredit).toFixed(2));

  // The client's ticket page shows a per-leg won/lost record (legsResolved)
  // *before* falling back to the bet's overall status. Correcting only the
  // status left a stale legsResolved from the original (buggy) auto-settle
  // in place — still saying `won: null` for the leg the old code couldn't
  // grade — so a ticket the admin just corrected to "won" still showed a
  // red ✗ next to the match. legsResolved must never be allowed to disagree
  // with the final status: when the objective grading agrees with `result`,
  // use its precise per-leg breakdown (real scores included); otherwise
  // (no verified result yet, or an admin deliberately overriding the
  // objective grade) force every leg to match `result` directly.
  const graded = gradeBet(bet);
  const legsResolved = graded && graded.status === result
    ? graded.legResults.map((r) => ({ matchId: r.leg.matchId, market: r.leg.market, outcome: r.leg.outcome, won: r.won, scoreHome: r.res.scoreHome, scoreAway: r.res.scoreAway }))
    : (bet.legs || []).map((leg) => ({
        matchId: leg.matchId, market: leg.market, outcome: leg.outcome,
        won: result === 'won' ? true : result === 'void' ? null : false,
      }));

  const updated = {
    ...bet,
    status: result,
    settledAt: new Date().toISOString(),
    settledBy: adminEmail || 'admin',
    settleReason: reason || null,
    settledPayout: newCredit,
    totalReturn: newCredit,
    legsResolved,
    wonNotAcknowledged: result === 'won',
    ...(isCorrection ? { correction: { fromStatus: bet.status, at: new Date().toISOString(), by: adminEmail || 'admin', reason } } : {}),
  };
  betsStore.set(betId, updated);

  if (delta !== 0) {
    const nextUser = await adjustBalance(bet.userId, delta, { allowNegative: true });
    pushTx(bet.userId, {
      kind: isCorrection ? 'bet_settlement_correction' : (result === 'won' ? 'bet_won' : 'bet_void_refund'),
      amount: delta, status: 'completed', balanceAfter: nextUser?.balance, ref: betId,
    });
  }
  logActivity(bet.userId, { kind: `bet_${result}`, betId, credit: delta });
  emitToUser(bet.userId, 'wallet:update', { balance: null, delta, reason: `bet:${result}`, ref: betId });
  emitToUser(bet.userId, 'bet:settled', { betId, status: result, payout: newCredit });
  if (result === 'won') emitToUser(bet.userId, 'bet:won', { betId, payout: newCredit, stake: bet.stake });
  emitAdmin('bet:settled', { betId, status: result, userId: bet.userId, stake: bet.stake, credit: delta });
  recordAudit({
    action: isCorrection ? `bet.correct.${result}` : `bet.settle.${result}`,
    target: betId, targetType: 'bet', severity: isCorrection ? 'warning' : 'info',
    meta: { userId: bet.userId, delta, previousStatus: isCorrection ? bet.status : undefined, reason },
  });

  return { ok: true, bet: updated };
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
