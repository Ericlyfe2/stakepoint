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

// Kept short because this is the worst-case wait between a match being marked
// finished and the bettor seeing "You have won". Feed / admin result writes
// also call settleNow() directly, so in practice payouts are near-instant.
const SETTLE_INTERVAL_MS = 5_000;

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

// The client's ticket page shows a leg's real outcome next to its status, and
// it must NEVER show the bettor's own pick as if it were the match result —
// that's exactly the bug this derives away: display the objective outcome
// key for the leg's market from the actual score, independent of what was
// picked, so a lost bet can't render its own losing selection as "Outcome".
// Returns null for markets with no single-token outcome (e.g. handicap
// markets, where the "outcome" depends on a per-leg line) — callers fall
// back to showing the real score line instead, never the pick.
export function legOutcomeLabel(leg, scoreHome, scoreAway) {
  const m = String(leg.market || '').toUpperCase();
  const total = scoreHome + scoreAway;
  const result1x2 = scoreHome > scoreAway ? '1' : scoreAway > scoreHome ? '2' : 'X';
  const both = scoreHome > 0 && scoreAway > 0;

  if (m === '1X2' || m === 'ML' || m === 'DC' || m === 'DNB') return result1x2;
  if (m === 'BTTS') return both ? 'Yes' : 'No';
  if (m in FOOTBALL_OU_LINES) return total > FOOTBALL_OU_LINES[m] ? 'Over' : 'Under';
  if (m === 'TP') return total > Number(leg.line || 220.5) ? 'Over' : 'Under';
  if (m === 'CS') return csOutcome(scoreHome, scoreAway);
  if (m === 'WINBTTS') return { '1': both ? '1Y' : '1N', X: both ? 'XY' : 'XN', '2': both ? '2Y' : '2N' }[result1x2];
  if (m === 'WINOU25') {
    const over = total > 2.5;
    return { '1': over ? '1O' : '1U', X: over ? 'XO' : 'XU', '2': over ? '2O' : '2U' }[result1x2];
  }
  return null; // AH1/HCAP/unknown — no single-token outcome, show the score instead
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

// settleNow() can be triggered from three places (the periodic timer, a
// manual admin result post, and a manual admin "settle now" button) that can
// overlap in time. Two overlapping calls would both snapshot the same open
// bets before either finished crediting the first one, double-paying it.
// This lock forces overlapping calls to run strictly one after another, and
// a per-bet re-check (bet.status is re-read from the store, not the stale
// snapshot, right before crediting) closes the same gap defensively.
let settleChain = Promise.resolve({ settledWins: 0, settledLoss: 0, settledVoid: 0 });

export function settleNow() {
  const run = settleChain.then(() => settleNowUnlocked());
  // Swallow rejections in the chain itself so one failed run doesn't wedge
  // every subsequent caller; callers still see their own run's rejection.
  settleChain = run.catch(() => {});
  return run;
}

/**
 * Pays out a settled bet's owed credit exactly once.
 *
 * A bet that owes money is first persisted with payoutStatus 'pending' (a
 * critical, awaited write), and only flipped to 'paid' once the wallet credit
 * has landed. That ordering is what makes a payout impossible to lose: the old
 * code marked the bet won and *then* credited, so any failure in between (a
 * balance-lock timeout, a DB hiccup, a redeploy mid-settle) left a "won" bet
 * that was never paid and, being no longer 'open', was never retried.
 *
 * The credit carries an idempotency key that is stored on the user record in
 * the same write as the balance, so re-running this for an already-credited
 * bet (e.g. a crash between the credit and the 'paid' marker) never pays twice.
 */
async function payOutBet(betId) {
  const bet = betsStore.get(betId);
  if (!bet || bet.payoutStatus !== 'pending') return false;
  const credit = Number(bet.payoutDue || 0);

  const user = getUserById(bet.userId);
  if (!user) {
    // Nobody to pay — stop retrying every tick, but leave a loud trail.
    log.error(`payout: bet ${betId} owes ${credit} but user ${bet.userId} no longer exists`);
    betsStore.set(betId, { ...bet, payoutStatus: 'no_user' });
    return false;
  }

  const nextUser = await adjustBalance(user.id, credit, { allowNegative: true, idempotencyKey: `settle:${betId}` });
  const kind = bet.status === 'won' ? 'bet_won' : 'bet_void_refund';
  const alreadyLogged = (txStore.get(user.id) || []).some((t) => t.ref === betId && t.kind === kind);
  if (!alreadyLogged) {
    pushTx(user.id, { kind, amount: credit, status: 'completed', balanceAfter: nextUser.balance, ref: betId });
    logActivity(user.id, { kind: `bet_${bet.status}`, betId, credit });
  }
  // Re-read: the user may have acknowledged the win (wonNotAcknowledged) while
  // the credit was in flight, and that must not be overwritten.
  await betsStore.setCritical(betId, { ...betsStore.get(betId), payoutStatus: 'paid', paidAt: new Date().toISOString() });
  emitToUser(user.id, 'wallet:update', { balance: nextUser.balance, delta: credit, reason: `bet:${bet.status}`, ref: betId });
  return true;
}

/**
 * Retries every payout that was owed but not yet confirmed as credited.
 * Runs at the start of every settle pass (so at boot and every few seconds),
 * which is what guarantees a won bet always ends up paid.
 */
export async function reconcilePendingPayouts() {
  const pending = Object.values(betsStore.all() || {}).filter((b) => b.payoutStatus === 'pending');
  let paid = 0;
  for (const b of pending) {
    try {
      if (await payOutBet(b.id)) paid++;
    } catch (e) {
      log.error(`payout retry failed for bet ${b.id}:`, e?.message || e);
    }
  }
  return paid;
}

/* ------------ repairing wins that were settled but never paid ------------ */

// Ledger entries that prove a bet's money reached the wallet.
const PAYOUT_LEDGER_KINDS = new Set(['bet_won', 'bet_void_refund', 'bet_settlement_correction']);

function hasPayoutLedgerEntry(bet) {
  return (txStore.get(bet.userId) || []).some((t) => t.ref === bet.id && PAYOUT_LEDGER_KINDS.has(t.kind));
}

function owedAmount(bet) {
  if (bet.status === 'won')  return Number((Number(bet.settledPayout) || Number(bet.totalReturn) || Number(bet.potentialWin) || 0).toFixed(2));
  if (bet.status === 'void') return Number((Number(bet.stake) || 0).toFixed(2));
  return 0;
}

function matchesQuery(bet, user, q) {
  const raw = String(q || '').trim().toLowerCase();
  if (!raw) return true;
  const digits = raw.replace(/\D/g, '');
  const userDigits = `${user?.phone || ''}${user?.email || ''}`.replace(/\D/g, '');
  return bet.id.toLowerCase() === raw
    || String(bet.bookingCode || '').toLowerCase() === raw
    || String(bet.userId || '').toLowerCase() === raw
    || String(user?.email || '').toLowerCase().includes(raw)
    || String(user?.displayName || '').toLowerCase().includes(raw)
    || (digits.length >= 6 && userDigits.includes(digits));
}

/**
 * Lists won / void bets that appear to have been settled without the wallet
 * ever being credited — the fallout of the old settle-then-credit ordering,
 * which settleNow() can never retry because the bet is no longer 'open'.
 *
 * "Appears" is deliberate: legacy bets carry no payout marker, so the evidence
 * is the absence of a matching wallet-ledger entry. A cleared or capped
 * (500-row) transaction history can therefore make a paid bet look unpaid, so
 * this is read-only and every row needs an admin to confirm before repayBet().
 * Bets the settler is already retrying itself ('pending') are excluded.
 */
export function findUnpaidPayouts({ q } = {}) {
  const rows = [];
  for (const bet of Object.values(betsStore.all() || {})) {
    if (!['won', 'void'].includes(bet.status)) continue;
    if (bet.payoutStatus === 'paid' || bet.payoutStatus === 'none' || bet.payoutStatus === 'pending') continue;
    const owed = owedAmount(bet);
    if (!(owed > 0) || hasPayoutLedgerEntry(bet)) continue;
    const user = getUserById(bet.userId);
    if (!matchesQuery(bet, user, q)) continue;
    rows.push({
      betId: bet.id,
      bookingCode: bet.bookingCode || null,
      userId: bet.userId,
      userExists: !!user,
      userEmail: user?.email || null,
      displayName: user?.displayName || null,
      status: bet.status,
      stake: bet.stake,
      owed,
      placedAt: bet.placedAt,
      settledAt: bet.settledAt,
      settledBy: bet.settledBy,
      trophyPending: !!bet.wonNotAcknowledged,
      legs: (bet.legs || []).map((l) => ({ home: l.home, away: l.away, market: l.market, outcome: l.outcome })),
    });
  }
  return rows.sort((a, b) => new Date(b.settledAt || b.placedAt || 0) - new Date(a.settledAt || a.placedAt || 0));
}

/**
 * Pays one stranded win/refund exactly once and, for a win, re-arms the
 * trophy so the player gets the "You won" celebration on their next poll.
 * The credit carries the same idempotency key the settler uses, so it can
 * never double-pay against the settler, another admin, or a repeated click.
 *
 * Returns { ok: true, bet, credited, balance } or { error: 'not_found' |
 * 'not_payable' | 'already_paid' | 'nothing_owed' | 'no_user' }.
 */
export async function repayBet(betId, { adminEmail } = {}) {
  const bet = betsStore.get(betId);
  if (!bet) return { error: 'not_found' };
  if (!['won', 'void'].includes(bet.status)) return { error: 'not_payable' };
  if (bet.payoutStatus === 'paid' || bet.payoutStatus === 'pending' || hasPayoutLedgerEntry(bet)) return { error: 'already_paid' };
  const amount = owedAmount(bet);
  if (!(amount > 0)) return { error: 'nothing_owed' };
  const user = getUserById(bet.userId);
  if (!user) return { error: 'no_user' };

  const nextUser = await adjustBalance(user.id, amount, { allowNegative: true, idempotencyKey: `settle:${bet.id}` });
  const now = new Date().toISOString();
  const paidBefore = !!nextUser.alreadyApplied; // key already on the user: money was credited earlier
  const kind = bet.status === 'won' ? 'bet_won' : 'bet_void_refund';
  if (!paidBefore) {
    pushTx(user.id, { kind, amount, status: 'completed', balanceAfter: nextUser.balance, ref: bet.id, note: 'Payout repair' });
    logActivity(user.id, { kind: `bet_${bet.status}`, betId: bet.id, credit: amount, repairedBy: adminEmail });
  }
  const updated = {
    ...betsStore.get(bet.id),
    payoutStatus: 'paid',
    payoutDue: amount,
    paidAt: now,
    payoutRepairedBy: adminEmail || 'admin',
    ...(bet.status === 'won' ? { wonNotAcknowledged: true, acknowledgedAt: null } : {}),
  };
  await betsStore.setCritical(bet.id, updated);

  emitToUser(user.id, 'wallet:update', { balance: nextUser.balance, delta: paidBefore ? 0 : amount, reason: `bet:${bet.status}`, ref: bet.id });
  emitToUser(user.id, 'bet:settled', { betId: bet.id, status: bet.status, payout: amount });
  if (bet.status === 'won') emitToUser(user.id, 'bet:won', { betId: bet.id, payout: amount, stake: bet.stake });
  emitAdmin('bet:settled', { betId: bet.id, status: bet.status, userId: user.id, stake: bet.stake, credit: paidBefore ? 0 : amount });
  recordAudit({
    action: 'bet.payout.repair', target: bet.id, targetType: 'bet', severity: 'warning',
    meta: { userId: user.id, amount, alreadyCredited: paidBefore, by: adminEmail },
  });
  // paidBefore: the wallet already had this credit (the marker was just missing),
  // so nothing was added — the bet is now correctly marked paid and the trophy re-armed.
  return { ok: true, bet: updated, credited: paidBefore ? 0 : amount, alreadyCredited: paidBefore, balance: nextUser.balance };
}

async function settleNowUnlocked() {
  await reconcilePendingPayouts();
  const open = Object.values(betsStore.all() || {}).filter((b) => b.status === 'open');
  let settledWins = 0, settledLoss = 0, settledVoid = 0;
  for (const bet0 of open) {
    // One bad bet must never stop the rest of the queue from being settled.
    try {
    // Re-read from the store: another settle pass earlier in this same
    // chain (or, pre-fix, an overlapping one) may have already settled it.
    const bet = betsStore.get(bet0.id);
    if (!bet || bet.status !== 'open') continue;
    const graded = gradeBet(bet);
    if (!graded) continue;
    const { status, legResults } = graded;

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
      payoutStatus: credit > 0 ? 'pending' : 'none',
      payoutDue: Number((credit || 0).toFixed(2)),
      legsResolved: legResults.map((r) => ({ matchId: r.leg.matchId, market: r.leg.market, outcome: r.leg.outcome, won: r.won, scoreHome: r.res.scoreHome, scoreAway: r.res.scoreAway, actualOutcome: legOutcomeLabel(r.leg, r.res.scoreHome, r.res.scoreAway) })),
      updatedAt: new Date().toISOString(),
      ...(status === 'won' ? { wonNotAcknowledged: true } : {}),
    };
    await betsStore.setCritical(bet.id, updated);

    // A failed credit is not fatal here: the bet is already persisted as
    // 'pending' and reconcilePendingPayouts() retries it on the next pass.
    if (credit > 0) {
      try {
        await payOutBet(bet.id);
      } catch (e) {
        log.error(`payout for bet ${bet.id} failed, will retry:`, e?.message || e);
      }
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
    } catch (e) {
      log.error(`settle bet ${bet0.id} failed:`, e?.message || e);
    }
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
export async function applySettlement(betId, { result, reason, payoutOverride, adminEmail, settledAt } = {}) {
  if (!['won', 'lost', 'void'].includes(result)) return { error: 'bad_result' };

  const bet = betsStore.get(betId);
  if (!bet) return { error: 'not_found' };
  if (bet.status === 'cashed_out') return { error: 'cashed_out' };

  const isCorrection = bet.status !== 'open';
  if (isCorrection && !reason?.trim()) return { error: 'reason_required' };

  const newCredit = result === 'won' ? (payoutOverride ?? bet.potentialWin ?? 0)
                   : result === 'void' ? (bet.stake || 0)
                   : 0;
  // A bet auto-settled but whose credit never landed (payoutStatus 'pending')
  // has been *paid nothing* despite totalReturn saying otherwise — treat it as
  // a first settlement so the full amount is owed, not just a zero delta.
  const owedUnpaid = bet.payoutStatus === 'pending';
  const previousCredit = (isCorrection && !owedUnpaid) ? (bet.settledPayout ?? bet.totalReturn ?? 0) : 0;
  const delta = Number((newCredit - previousCredit).toFixed(2));
  // First settlements share the auto-settler's idempotency key, so an admin
  // settle racing the settle loop (or a retry) can never pay the same bet twice.
  const creditKey = (!isCorrection || owedUnpaid) ? `settle:${betId}` : null;

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
    ? graded.legResults.map((r) => ({ matchId: r.leg.matchId, market: r.leg.market, outcome: r.leg.outcome, won: r.won, scoreHome: r.res.scoreHome, scoreAway: r.res.scoreAway, actualOutcome: legOutcomeLabel(r.leg, r.res.scoreHome, r.res.scoreAway) }))
    : (bet.legs || []).map((leg) => ({
        matchId: leg.matchId, market: leg.market, outcome: leg.outcome,
        won: result === 'won' ? true : result === 'void' ? null : false,
      }));

  const updated = {
    ...bet,
    status: result,
    // An admin slip-edit may carry an explicit settlement timestamp; first /
    // ordinary settlements still stamp "now". Always presented/stored as an
    // ISO-8601 UTC string, matching placedAt and the rest of the schema.
    settledAt: settledAt ?? new Date().toISOString(),
    settledBy: adminEmail || 'admin',
    settleReason: reason || null,
    settledPayout: newCredit,
    totalReturn: newCredit,
    payoutStatus: newCredit > 0 ? 'paid' : 'none',
    payoutDue: newCredit,
    legsResolved,
    wonNotAcknowledged: result === 'won',
    updatedAt: new Date().toISOString(),
    ...(isCorrection ? { correction: { fromStatus: bet.status, at: new Date().toISOString(), by: adminEmail || 'admin', reason } } : {}),
  };

  // Credit the wallet BEFORE persisting the new status: if the credit throws,
  // the admin sees the error and the bet is untouched (still retryable),
  // rather than a bet marked won that never paid.
  let nextUser = null;
  if (delta !== 0) {
    nextUser = await adjustBalance(bet.userId, delta, { allowNegative: true, ...(creditKey ? { idempotencyKey: creditKey } : {}) });
    if (!nextUser.alreadyApplied) {
      pushTx(bet.userId, {
        kind: isCorrection ? 'bet_settlement_correction' : (result === 'won' ? 'bet_won' : 'bet_void_refund'),
        amount: delta, status: 'completed', balanceAfter: nextUser?.balance, ref: betId,
      });
    }
  }
  await betsStore.setCritical(betId, updated);
  logActivity(bet.userId, { kind: `bet_${result}`, betId, credit: delta });
  emitToUser(bet.userId, 'wallet:update', { balance: (nextUser ?? getUserById(bet.userId))?.balance ?? null, delta, reason: `bet:${result}`, ref: betId });
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
