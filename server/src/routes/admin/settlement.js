import { Router } from 'express';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/httpError.js';
import { createStore } from '../../db/store.js';
import { setResult, adminLookupFixture, compiledLeagues } from '../../db/sportsAdmin.js';
import { settleNow } from '../../services/settlement.js';
import { adjustBalance, logActivity } from '../../db/users.js';
import { emitToUser, emitAdmin } from '../../services/realtime.js';

const betStore = createStore('bets', {});
const txStore = createStore('transactions', {});
const router = Router();

function round2(v) { return Number(Number(v).toFixed(2)); }

router.get('/queue', requireAdmin, (req, res) => {
  const allBets = betStore.all() || {};
  const openBets = Object.values(allBets).filter((b) => b.status === 'open');

  const byMatch = {};
  for (const bet of openBets) {
    for (const leg of bet.legs || []) {
      const mid = leg.matchId;
      if (!byMatch[mid]) byMatch[mid] = { matchId: mid, home: leg.home, away: leg.away, betCount: 0, totalStake: 0, betIds: [] };
      byMatch[mid].betCount++;
      byMatch[mid].totalStake += bet.stake || 0;
      if (bet.id) byMatch[mid].betIds.push(bet.id);
    }
  }

  const queue = Object.values(byMatch).map((f) => {
    let fixture = null;
    try { fixture = adminLookupFixture(f.matchId); } catch {}
    const result = fixture?.finished ? { scoreHome: fixture.scoreHome, scoreAway: fixture.scoreAway, source: fixture.finalSource, finishedAt: fixture.finishedAt } : null;
    return {
      ...f,
      totalStake: round2(f.totalStake),
      fixture: fixture ? { home: fixture.home, away: fixture.away, kickoff: fixture.kickoff, day: fixture.day } : null,
      result,
      isLive: fixture?.isLive || false,
      finished: fixture?.finished || false,
    };
  });

  const pending = queue.filter((f) => !f.finished).sort((a, b) => b.betCount - a.betCount);
  const awaitingSettle = queue.filter((f) => f.finished && f.betCount > 0).sort((a, b) => b.betCount - a.betCount);
  const settled = Object.values(allBets)
    .filter((b) => ['won', 'lost', 'void', 'cashed_out'].includes(b.status))
    .sort((a, b) => new Date(b.settledAt || b.placedAt) - new Date(a.settledAt || b.placedAt))
    .slice(0, 50)
    .map((b) => ({
      id: b.id,
      userId: b.userId,
      status: b.status,
      stake: b.stake,
      payout: b.settledPayout || b.totalReturn || 0,
      legs: (b.legs || []).map((l) => ({ matchId: l.matchId, home: l.home, away: l.away, market: l.market, outcome: l.outcome })),
      settledAt: b.settledAt,
      settledBy: b.settledBy,
    }));

  res.json({ pending, awaitingSettle, settled });
});

router.get('/fixtures', requireAdmin, asyncHandler(async (req, res) => {
  const { status } = req.query;

  const raw = compiledLeagues();
  const rows = [];
  for (const sp of raw) {
    for (const lg of sp.leagues || []) {
      for (const m of lg.matches || []) {
        rows.push({
          id: m.id,
          sport: sp.id,
          leagueId: lg.id,
          leagueName: lg.name,
          home: m.home,
          away: m.away,
          kickoff: m.kickoff,
          day: m.day,
          isLive: m.isLive || false,
          finished: m.finished || false,
          suspended: m.suspended || false,
          scoreHome: m.scoreHome,
          scoreAway: m.scoreAway,
          finalSource: m.finalSource,
          finishedAt: m.finishedAt,
        });
      }
    }
  }

  let filtered = rows;
  if (status === 'finished') filtered = rows.filter((r) => r.finished);
  else if (status === 'unsettled') filtered = rows.filter((r) => !r.finished && !r.isLive);
  else if (status === 'live') filtered = rows.filter((r) => r.isLive);

  const allBets = betStore.all() || {};
  const openBets = Object.values(allBets).filter((b) => b.status === 'open');
  const openByMatch = {};
  for (const b of openBets) {
    for (const leg of b.legs || []) {
      if (!openByMatch[leg.matchId]) openByMatch[leg.matchId] = { betCount: 0, totalStake: 0 };
      openByMatch[leg.matchId].betCount++;
      openByMatch[leg.matchId].totalStake += b.stake || 0;
    }
  }

  const enriched = filtered.map((r) => ({
    ...r,
    openBets: openByMatch[r.id]?.betCount || 0,
    openStake: round2(openByMatch[r.id]?.totalStake || 0),
  }));

  res.json({ fixtures: enriched });
}));

function pushTx(userId, tx) {
  const list = txStore.get(userId) || [];
  txStore.set(userId, [tx, ...list].slice(0, 500));
}

router.post('/fixtures/:id/result', requireAdmin, requireRole('odds_manager'), asyncHandler(async (req, res) => {
  const matchId = req.params.id;
  const { scoreHome, scoreAway, autoSettle } = req.body;
  if (scoreHome === undefined || scoreAway === undefined || typeof scoreHome !== 'number' || typeof scoreAway !== 'number') {
    return res.status(400).json({ error: 'scoreHome and scoreAway are required' });
  }

  setResult(matchId, scoreHome, scoreAway, 'manual');
  audit(req, { action: 'settlement.result', target: matchId, targetType: 'fixture', severity: 'info', meta: { scoreHome, scoreAway } });

  let settled = { settledWins: 0, settledLoss: 0, settledVoid: 0 };
  if (autoSettle !== false) {
    settled = await settleNow();
    audit(req, { action: 'settlement.trigger', target: matchId, targetType: 'fixture', severity: 'info', meta: settled });
  }

  res.json({ ok: true, result: { scoreHome, scoreAway, source: 'manual', finishedAt: new Date().toISOString() }, settled });
}));

router.post('/fixtures/:id/settle', requireAdmin, requireRole('odds_manager'), asyncHandler(async (req, res) => {
  const settled = await settleNow();
  audit(req, { action: 'settlement.trigger', target: req.params.id, targetType: 'fixture', severity: 'info', meta: settled });
  res.json({ ok: true, settled });
}));

router.post('/bets/:id/settle', requireAdmin, requireRole('odds_manager'), asyncHandler(async (req, res) => {
  const betId = req.params.id;
  const { result, reason } = req.body;
  if (!['won', 'lost', 'void'].includes(result)) return res.status(400).json({ error: 'result must be won, lost, or void' });

  const bet = betStore.get(betId);
  if (!bet) throw notFound('Bet not found');
  if (bet.status !== 'open') return res.status(409).json({ error: `Bet is ${bet.status}, not open` });

  const credit = result === 'won' ? (bet.potentialWin || 0) : result === 'void' ? (bet.stake || 0) : 0;

  const updated = {
    ...bet,
    status: result,
    settledAt: new Date().toISOString(),
    settledBy: req.admin?.email || 'admin',
    settleReason: reason || null,
    settledPayout: credit,
    totalReturn: credit,
    wonNotAcknowledged: result === 'won',
  };
  betStore.set(betId, updated);

  if (credit > 0) {
    await adjustBalance(bet.userId, credit, { allowNegative: false });
    pushTx(bet.userId, { kind: result === 'won' ? 'bet_won' : 'bet_void_refund', amount: credit, ref: betId, status: 'completed', at: new Date().toISOString() });
  }
  logActivity(bet.userId, { kind: `bet_${result}`, amount: credit, ref: betId, by: req.admin?.email });
  emitToUser(bet.userId, 'wallet:update', { balance: null, delta: credit, reason: `bet:${result}`, ref: betId });
  emitToUser(bet.userId, 'bet:settled', { betId, status: result, payout: credit });
  emitAdmin('bet:settled', { betId, status: result, userId: bet.userId, stake: bet.stake, credit });
  audit(req, { action: `bet.settle.${result}`, target: betId, targetType: 'bet', severity: 'info', meta: { userId: bet.userId, credit, reason } });

  res.json({ ok: true, bet: updated });
}));

router.post('/bulk', requireAdmin, requireRole('odds_manager'), asyncHandler(async (req, res) => {
  const { betIds, result, reason } = req.body;
  if (!betIds || !Array.isArray(betIds) || betIds.length === 0) return res.status(400).json({ error: 'betIds array required' });
  if (betIds.length > 200) return res.status(400).json({ error: 'Max 200 bets per bulk operation' });
  if (!['won', 'lost', 'void'].includes(result)) return res.status(400).json({ error: 'result must be won, lost, or void' });

  const results = [];
  for (const betId of betIds) {
    try {
      const bet = betStore.get(betId);
      if (!bet) { results.push({ betId, error: 'not found' }); continue; }
      if (bet.status !== 'open') { results.push({ betId, error: `status is ${bet.status}` }); continue; }

      const credit = result === 'won' ? (bet.potentialWin || 0) : result === 'void' ? (bet.stake || 0) : 0;
      const updated = {
        ...bet,
        status: result,
        settledAt: new Date().toISOString(),
        settledBy: req.admin?.email || 'admin',
        settleReason: reason || null,
        settledPayout: credit,
        totalReturn: credit,
        wonNotAcknowledged: result === 'won',
      };
      betStore.set(betId, updated);

      if (credit > 0) {
        await adjustBalance(bet.userId, credit, { allowNegative: false });
        pushTx(bet.userId, { kind: result === 'won' ? 'bet_won' : 'bet_void_refund', amount: credit, ref: betId, status: 'completed', at: new Date().toISOString() });
      }
      logActivity(bet.userId, { kind: `bet_${result}`, amount: credit, ref: betId, by: req.admin?.email });
      emitToUser(bet.userId, 'wallet:update', { balance: null, delta: credit, reason: `bet:${result}`, ref: betId });
      emitToUser(bet.userId, 'bet:settled', { betId, status: result, payout: credit });
      emitAdmin('bet:settled', { betId, status: result, userId: bet.userId, stake: bet.stake, credit });
      audit(req, { action: `bulk.settle.${result}`, target: betId, targetType: 'bet', severity: 'info', meta: { userId: bet.userId, credit } });

      results.push({ betId, status: result, credit });
    } catch (e) {
      results.push({ betId, error: e.message });
    }
  }

  audit(req, { action: 'bulk.settle', target: 'bulk', targetType: 'bet', severity: 'warning', meta: { count: betIds.length, result } });
  res.json({ ok: true, results });
}));

export default router;
