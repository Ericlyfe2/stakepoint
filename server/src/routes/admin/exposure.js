import { Router } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { createStore } from '../../db/store.js';
import { compiledLeagues } from '../../db/sportsAdmin.js';

const betStore = createStore('bets', {});
const router = Router();

function round2(v) { return Number(Number(v).toFixed(2)); }

router.get('/overview', requireAdmin, (req, res) => {
  const allBets = betStore.all() || {};
  const openBets = Object.values(allBets).filter((b) => b.status === 'open');

  const totalStake = openBets.reduce((s, b) => s + (b.stake || 0), 0);
  const totalLiability = openBets.reduce((s, b) => {
    const win = b.potentialWin || 0;
    const stake = b.stake || 0;
    return s + (win - stake);
  }, 0);
  const totalPotentialPayout = openBets.reduce((s, b) => s + (b.potentialWin || 0), 0);

  const singles = openBets.filter((b) => b.mode === 'single');
  const multiples = openBets.filter((b) => b.mode === 'multiple');
  const systems = openBets.filter((b) => b.mode === 'system');

  const singleLiability = singles.reduce((s, b) => s + ((b.potentialWin || 0) - (b.stake || 0)), 0);
  const multipleLiability = multiples.reduce((s, b) => s + ((b.potentialWin || 0) - (b.stake || 0)), 0);
  const systemLiability = systems.reduce((s, b) => s + ((b.potentialWin || 0) - (b.stake || 0)), 0);

  res.json({
    totalBets: openBets.length,
    totalStake: round2(totalStake),
    totalLiability: round2(totalLiability),
    totalPotentialPayout: round2(totalPotentialPayout),
    breakdown: {
      singles:   { count: singles.length,   stake: round2(singles.reduce((s, b) => s + (b.stake || 0), 0)),   liability: round2(singleLiability) },
      multiples: { count: multiples.length, stake: round2(multiples.reduce((s, b) => s + (b.stake || 0), 0)), liability: round2(multipleLiability) },
      systems:   { count: systems.length,   stake: round2(systems.reduce((s, b) => s + (b.stake || 0), 0)),   liability: round2(systemLiability) },
    },
  });
});

router.get('/fixtures', requireAdmin, (req, res) => {
  const allBets = betStore.all() || {};
  const openBets = Object.values(allBets).filter((b) => b.status === 'open');

  const byFixture = {};
  for (const bet of openBets) {
    for (const leg of bet.legs || []) {
      const matchId = leg.matchId;
      if (!byFixture[matchId]) {
        byFixture[matchId] = {
          matchId,
          home: leg.home,
          away: leg.away,
          totalStake: 0,
          totalLiability: 0,
          totalBets: 0,
          markets: {},
        };
      }
      const f = byFixture[matchId];
      const isSingle = bet.mode === 'single';
      const legLiability = isSingle
        ? ((bet.potentialWin || 0) - (bet.stake || 0))
        : 0;
      const legStake = isSingle
        ? (bet.stake || 0)
        : ((bet.stake || 0) / (bet.legs?.length || 1));

      f.totalStake += legStake;
      f.totalLiability += legLiability;
      f.totalBets += isSingle ? 1 : 0;

      const mkt = leg.market;
      if (!f.markets[mkt]) {
        f.markets[mkt] = {
          market: mkt,
          marketName: leg.marketName || mkt,
          totalStake: 0,
          totalLiability: 0,
          totalBets: 0,
          selections: {},
        };
      }
      const m = f.markets[mkt];
      m.totalStake += legStake;
      m.totalLiability += legLiability;
      m.totalBets += isSingle ? 1 : 0;

      const outcome = leg.outcome;
      if (!m.selections[outcome]) {
        m.selections[outcome] = {
          outcome,
          label: leg.outcome,
          totalStake: 0,
          totalLiability: 0,
          totalBets: 0,
        };
      }
      const s = m.selections[outcome];
      s.totalStake += legStake;
      s.totalLiability += legLiability;
      s.totalBets += isSingle ? 1 : 0;
    }
  }

  const fixtures = Object.values(byFixture).map((f) => ({
    ...f,
    totalStake: round2(f.totalStake),
    totalLiability: round2(f.totalLiability),
    markets: Object.fromEntries(
      Object.entries(f.markets).map(([k, v]) => [k, {
        ...v,
        totalStake: round2(v.totalStake),
        totalLiability: round2(v.totalLiability),
        selections: Object.fromEntries(
          Object.entries(v.selections).map(([sk, sv]) => [sk, {
            ...sv,
            totalStake: round2(sv.totalStake),
            totalLiability: round2(sv.totalLiability),
          }])
        ),
      }])
    ),
  }));

  fixtures.sort((a, b) => b.totalLiability - a.totalLiability);

  const topFixtures = fixtures.slice(0, 100);
  const totalByFixture = fixtures.reduce((s, f) => s + f.totalLiability, 0);

  res.json({
    fixtures: topFixtures,
    totalFixtures: fixtures.length,
    totalByFixture: round2(totalByFixture),
  });
});

export default router;
