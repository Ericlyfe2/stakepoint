import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data-test-cashout-lock');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.PATHS = JSON.stringify({ data: DATA_DIR });

function cleanData() {
  if (fs.existsSync(DATA_DIR)) {
    for (const f of fs.readdirSync(DATA_DIR)) fs.unlinkSync(path.join(DATA_DIR, f));
  }
}

// Mirrors isCashoutLockedForBet() in src/routes/cashout.js — that function
// isn't exported (route files aren't structured for direct import in this
// codebase's test suite, matching the convention already used in
// cashout.execute.test.js), so this reimplements the same one-line predicate
// against the real adminLookupFixture() to prove the underlying data flow.
async function isCashoutLockedForBet(bet, adminLookupFixture) {
  return (bet.legs || []).some((leg) => adminLookupFixture(leg.matchId)?.match?.cashoutLocked === true);
}

describe('cash-out lock enforcement', () => {
  before(() => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cleanData();
  });
  after(() => cleanData());

  // Overrides only take effect on fixtures that already exist in the
  // admin-compiled view (compiledLeagues() applies overrides onto base/custom
  // matches — it never synthesizes an entry for an unknown matchId), so every
  // case here creates a real custom fixture first via addCustomFixture(),
  // exactly like an admin-created match would exist in production.
  function makeFixture(id) {
    return { id, sport: 'football', leagueId: 'admin-misc', home: 'A', away: 'B', isLive: true, markets: {} };
  }

  test('a fixture patched cashoutLocked: true is seen as locked via adminLookupFixture', async () => {
    const { addCustomFixture, patchOverride, adminLookupFixture } = await import('../src/db/sportsAdmin.js');
    addCustomFixture(makeFixture('fx-lock-1'));
    patchOverride('fx-lock-1', { cashoutLocked: true });

    const bet = { legs: [{ matchId: 'fx-lock-1', market: '1X2', outcome: '1' }] };
    assert.equal(await isCashoutLockedForBet(bet, adminLookupFixture), true);
  });

  test('a fixture never locked is not seen as locked', async () => {
    const { addCustomFixture, adminLookupFixture } = await import('../src/db/sportsAdmin.js');
    addCustomFixture(makeFixture('fx-never-locked'));
    const bet = { legs: [{ matchId: 'fx-never-locked', market: '1X2', outcome: '1' }] };
    assert.equal(await isCashoutLockedForBet(bet, adminLookupFixture), false);
  });

  test('admin unlocking (cashoutLocked: false) is respected', async () => {
    const { addCustomFixture, patchOverride, adminLookupFixture } = await import('../src/db/sportsAdmin.js');
    addCustomFixture(makeFixture('fx-lock-2'));
    patchOverride('fx-lock-2', { cashoutLocked: true });
    patchOverride('fx-lock-2', { cashoutLocked: false });

    const bet = { legs: [{ matchId: 'fx-lock-2', market: '1X2', outcome: '1' }] };
    assert.equal(await isCashoutLockedForBet(bet, adminLookupFixture), false);
  });

  test('a multi bet is locked if ANY leg matches a locked fixture', async () => {
    const { addCustomFixture, patchOverride, adminLookupFixture } = await import('../src/db/sportsAdmin.js');
    addCustomFixture(makeFixture('fx-lock-3a'));
    addCustomFixture(makeFixture('fx-lock-3b'));
    patchOverride('fx-lock-3a', { cashoutLocked: false });
    patchOverride('fx-lock-3b', { cashoutLocked: true });

    const bet = {
      legs: [
        { matchId: 'fx-lock-3a', market: '1X2', outcome: '1' },
        { matchId: 'fx-lock-3b', market: '1X2', outcome: '2' },
      ],
    };
    assert.equal(await isCashoutLockedForBet(bet, adminLookupFixture), true);
  });
});
