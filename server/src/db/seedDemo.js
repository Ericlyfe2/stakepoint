/**
 * Demo dataset seeder. Runs only when bets/transactions stores are empty so
 * the admin dashboard has something to render on first boot. No-op on an
 * established install.
 */
import { hashPassword } from '../services/password.js';
import { allUsers, createUser, findByEmail, updateUser, logActivity } from './users.js';
import { createStore } from './store.js';
import { recordAudit } from './audit.js';
import { log } from '../utils/logger.js';

const betsStore = createStore('bets', {});
const txStore   = createStore('transactions', {});

const FIRST = ['Akua', 'Kwame', 'Yaw', 'Esi', 'Kojo', 'Ama', 'Kofi', 'Adwoa', 'Fiifi', 'Abena', 'Selasi', 'Mawuli', 'Dela', 'Naa', 'Nana', 'Kwabena', 'Kweku', 'Sefa', 'Efua', 'Kobby'];
const LAST  = ['Mensah', 'Owusu', 'Asare', 'Boateng', 'Appiah', 'Adjei', 'Annan', 'Tetteh', 'Quartey', 'Ofori', 'Sarpong', 'Yeboah', 'Frimpong', 'Otoo', 'Mireku', 'Dadzie', 'Acheampong', 'Nkrumah'];
const TAGS  = ['VIP', 'HighRoller', 'NewSignup', 'BonusAbuse?', 'Retention', 'Promo'];
const STATUSES = ['open', 'open', 'won', 'lost', 'won', 'lost', 'void', 'cashed_out'];
const KYC = ['unverified', 'pending', 'verified', 'verified', 'verified', 'rejected'];

const MATCHES = [
  { id: 'gh-adu-med', home: 'Aduana Stars',      away: 'Medeama SC',     sport: 'football'  },
  { id: 'gh-dre-bec', home: 'Dreams FC',         away: 'Bechem United',  sport: 'football'  },
  { id: 'epl-ars-che',home: 'Arsenal',           away: 'Chelsea',        sport: 'football'  },
  { id: 'epl-mci-liv',home: 'Manchester City',   away: 'Liverpool',      sport: 'football'  },
  { id: 'esp-rea-bar',home: 'Real Madrid',       away: 'FC Barcelona',   sport: 'football'  },
  { id: 'nba-lal-bos',home: 'LA Lakers',         away: 'Boston Celtics', sport: 'basketball'},
  { id: 'atp-djk-naz',home: 'Djokovic',          away: 'Alcaraz',        sport: 'tennis'    },
];
const OUTCOMES = [
  { market: '1X2',  outcome: '1', odds: 1.85 },
  { market: '1X2',  outcome: 'X', odds: 3.40 },
  { market: '1X2',  outcome: '2', odds: 4.10 },
  { market: 'OU25', outcome: 'Over',  odds: 1.95 },
  { market: 'OU25', outcome: 'Under', odds: 1.85 },
  { market: 'BTTS', outcome: 'Yes', odds: 1.75 },
  { market: 'BTTS', outcome: 'No',  odds: 2.05 },
];

const rng = () => Math.random();
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (lo, hi) => Math.floor(rng() * (hi - lo + 1)) + lo;

function isoNDaysAgo(days, jitter = true) {
  const ms = Date.now() - (days * 86_400_000) - (jitter ? Math.floor(rng() * 86_400_000) : 0);
  return new Date(ms).toISOString();
}

export async function seedDemoData() {
  // NEVER seed fake data in production or when a real database is connected.
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) return false;
  if (Object.keys(betsStore.all() || {}).length > 0) return false;

  const existingNonAdmin = allUsers().filter((u) => u.role !== 'admin').length;
  const passwordHash = await hashPassword('Demo@12345');

  const createdUserIds = [];
  const target = Math.max(0, 40 - existingNonAdmin);
  for (let i = 0; i < target; i++) {
    const first = pick(FIRST);
    const last  = pick(LAST);
    const email = `${first}.${last}.${randInt(10, 99)}@example.gh`.toLowerCase();
    if (findByEmail(email)) continue;
    const createdAt = isoNDaysAgo(randInt(0, 29));
    const user = createUser({
      email,
      displayName: `${first} ${last}`,
      passwordHash,
      emailVerified: rng() > 0.1,
      balance: Number((randInt(0, 5000) + rng()).toFixed(2)),
    });
    updateUser(user.id, {
      createdAt,
      updatedAt: createdAt,
      suspended: rng() < 0.05,
      kycStatus: pick(KYC),
      tags: rng() < 0.3 ? [pick(TAGS)] : [],
      picture: null,
    });
    createdUserIds.push(user.id);
  }

  // Backfill bet history for ALL non-admin users (including any that pre-existed)
  const players = allUsers().filter((u) => u.role !== 'admin');

  for (const u of players) {
    const txList = [];
    if (rng() < 0.85) {
      const depositAmt = randInt(50, 1500);
      const at = isoNDaysAgo(randInt(0, 29));
      txList.push({ id: `tx-${at}-${u.id.slice(0, 4)}`, userId: u.id, at, kind: 'deposit', amount: depositAmt, method: pick(['momo', 'vodafone', 'card']), status: 'completed', balanceAfter: u.balance });
    }
    if (rng() < 0.35) {
      const wdAmt = randInt(20, 800);
      const at = isoNDaysAgo(randInt(0, 14));
      txList.push({ id: `tx-${at}-${u.id.slice(0, 4)}-w`, userId: u.id, at, kind: 'withdraw', amount: -wdAmt, method: 'momo', status: rng() < 0.2 ? 'pending' : 'completed', balanceAfter: u.balance });
    }
    if (txList.length) txStore.set(u.id, txList);

    const nBets = randInt(1, 8);
    for (let i = 0; i < nBets; i++) {
      const placedAt = isoNDaysAgo(randInt(0, 29));
      const legCount = rng() < 0.5 ? 1 : randInt(2, 4);
      const legs = [];
      let totalOdds = 1;
      for (let j = 0; j < legCount; j++) {
        const match = pick(MATCHES);
        const sel = pick(OUTCOMES);
        legs.push({
          matchId: match.id,
          home: match.home,
          away: match.away,
          market: sel.market,
          marketName: sel.market === '1X2' ? 'Match Result' : sel.market === 'OU25' ? 'Total Goals' : 'BTTS',
          outcome: sel.outcome,
          odds: sel.odds,
          sport: match.sport,
        });
        totalOdds *= sel.odds;
      }
      const stake = randInt(5, 500);
      const mode = legCount === 1 ? 'single' : 'multiple';
      const status = pick(STATUSES);
      const id = `bv-${new Date(placedAt).getTime()}-${Math.random().toString(36).slice(2, 7)}`;
      const receipt = {
        id, userId: u.id, placedAt, mode, stake, currency: 'GHS',
        totalOdds: Number(totalOdds.toFixed(4)),
        potentialWin: Number((stake * totalOdds * 1.08).toFixed(2)),
        bonusRate: 0.08, legs, status,
      };
      if (status === 'cashed_out') receipt.cashOut = Number((stake * totalOdds * 0.6).toFixed(2));
      betsStore.set(id, receipt);
    }
    logActivity(u.id, { kind: 'login_success', ip: `41.66.${randInt(0, 255)}.${randInt(0, 255)}` });
  }

  // A handful of audit events so the security tab isn't empty
  recordAudit({ actorId: null, action: 'system.boot', meta: { note: 'Demo data seeded.' } });
  recordAudit({ actorId: null, action: 'security.scan', severity: 'info', meta: { result: 'clean' } });
  recordAudit({ actorId: null, action: 'fraud.flag', severity: 'warning', target: pick(players).id, targetType: 'user', meta: { signal: 'velocity', score: 0.78 } });
  recordAudit({ actorId: null, action: 'fraud.flag', severity: 'critical', target: pick(players).id, targetType: 'user', meta: { signal: 'duplicate_device', score: 0.92 } });

  log.info(`Demo seed: ${players.length} players, bets+tx populated.`);
  return true;
}
