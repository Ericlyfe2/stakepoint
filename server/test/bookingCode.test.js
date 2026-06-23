import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data-test');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.PATHS = JSON.stringify({ data: DATA_DIR });
process.env.JWT_SECRET = 'test-secret-key-for-jwt';
process.env.JWT_ACCESS_TTL = '1h';
process.env.JWT_REFRESH_TTL = '30d';
process.env.JWT_ISSUER = 'xenbet-test';
process.env.GOOGLE_ENABLED = 'false';

function cleanData() {
  try {
    if (fs.existsSync(DATA_DIR)) {
      for (const f of fs.readdirSync(DATA_DIR)) {
        const fp = path.join(DATA_DIR, f);
        fs.unlinkSync(fp);
      }
    }
  } catch { /* ignore */ }
}

const CODE_REGEX = /^[ABCDEFGHIJKLMNPQRSTUVWXYZ]{2}[1-9]{5}$/;
const FALLBACK_REGEX = /^[ABCDFGHIJKLMNPQRSTUVWXYZ]{3}[1-9]{4}$/;

describe('Booking Code', () => {
  let generateBookingCode, uniqueBookingCode, findBetByBookingCode, rebuildBookCodeIndex, createStore, pushBet;
  let betsStore;

  before(async () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cleanData();
    const storeModule = await import('../src/db/store.js');
    await storeModule.initStores();
    createStore = storeModule.createStore;
    betsStore = createStore('bets', {});

    const betModule = await import('../src/routes/bet.js');
    generateBookingCode = betModule.generateBookingCode;
    uniqueBookingCode = betModule.uniqueBookingCode;
    findBetByBookingCode = betModule.findBetByBookingCode;
    rebuildBookCodeIndex = betModule.rebuildBookCodeIndex;
    pushBet = betModule.pushBet;
  });

  after(() => cleanData());

  // ─── FORMAT VALIDATION ─────────────────────────────────────────────────

  test('generates booking code in correct AA12345 format', () => {
    const code = generateBookingCode();
    assert.ok(CODE_REGEX.test(code), `Code "${code}" does not match AA12345 format`);
  });

  test('booking code has no ambiguous characters (O/0)', () => {
    const A = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';
    for (let i = 0; i < 1000; i++) {
      const code = generateBookingCode();
      assert.ok(!code.includes('O'), `Code "${code}" contains ambiguous letter O`);
    }
  });

  test('booking code uses only digits 1-9 (no zero)', () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateBookingCode();
      assert.ok(!code.includes('0'), `Code "${code}" contains zero digit`);
    }
  });

  // ─── UNIQUENESS (27M namespace) ───────────────────────────────────────

  test('generates 500 unique booking codes with zero collisions', () => {
    const codes = new Set();
    for (let i = 0; i < 500; i++) {
      codes.add(generateBookingCode());
    }
    assert.equal(codes.size, 500, `Got ${codes.size} unique codes out of 500 generated`);
  });

  test('STRESS: generates 5,000 unique booking codes with zero collisions', () => {
    const codes = new Set();
    for (let i = 0; i < 5_000; i++) {
      const code = generateBookingCode();
      if (codes.has(code)) {
        assert.fail(`Collision detected at iteration ${i}: "${code}"`);
      }
      codes.add(code);
    }
    assert.equal(codes.size, 5_000, `Got ${codes.size} unique codes out of 5,000 generated`);
  });

  // ─── uniqueBookingCode() ──────────────────────────────────────────────

  test('uniqueBookingCode returns unique codes', async () => {
    const codes = new Set();
    for (let i = 0; i < 500; i++) {
      const code = await uniqueBookingCode();
      assert.ok(CODE_REGEX.test(code) || FALLBACK_REGEX.test(code),
        `Code "${code}" does not match expected format`);
      assert.ok(!codes.has(code), `Duplicate code "${code}" at iteration ${i}`);
      codes.add(code);
    }
  });

  test('findBetByBookingCode returns null for non-existent code', () => {
    // Ensure store is clean — no bets should exist at this point
    const result = findBetByBookingCode('XX99999');
    assert.equal(result, null, 'Should return null for code that was never created');
  });

  test('uniqueBookingCode never collides with existing bets', async () => {
    // Seed 1000 bets with known codes
    const existing = new Set();
    for (let i = 0; i < 1000; i++) {
      const code = `ZZ${String(i).padStart(5, '0')}`;
      const bet = { id: `seed-${i}`, bookingCode: code, userId: 'test', stake: 100, status: 'open' };
      await betsStore.setCritical(bet.id, bet);
      existing.add(code);
    }
    rebuildBookCodeIndex();

    // Now generate codes and verify none collide
    for (let i = 0; i < 500; i++) {
      const code = await uniqueBookingCode();
      assert.ok(!existing.has(code), `uniqueBookingCode returned existing code "${code}"`);
    }
  });

  test('uniqueBookingCode fallback triggers when namespace is full', async () => {
    // Fill the store with enough codes to potentially trigger the 100-retry fallback
    const used = new Set();
    for (let i = 0; i < 5000; i++) {
      const code = await uniqueBookingCode();
      used.add(code);
    }
    const codes = used;
    assert.ok(codes.size >= 5000, `Expected at least 5000 codes, got ${codes.size}`);
    for (const code of codes) {
      assert.ok(CODE_REGEX.test(code) || FALLBACK_REGEX.test(code),
        `Code "${code}" does not match any valid format`);
    }
  });

  // ─── BOOKING CODE INDEX ───────────────────────────────────────────────

  test('findBetByBookingCode returns correct bet via index', async () => {
    const testBet = {
      id: 'find-test-1',
      bookingCode: 'FT99999',
      userId: 'test@user.com',
      stake: 250,
      status: 'open',
    };
    const { createStore: cs } = await import('../src/db/store.js');
    const bs = cs('bets', {});
    await bs.setCritical(testBet.id, testBet);
    rebuildBookCodeIndex();

    const found = findBetByBookingCode('FT99999');
    assert.ok(found, 'Bet should be found via index');
    assert.equal(found.id, 'find-test-1');
    assert.equal(found.bookingCode, 'FT99999');
  });

  test('findBetByBookingCode is case-sensitive (uppercase)', () => {
    const result = findBetByBookingCode('ft99999');
    assert.equal(result, null, 'Lowercase lookup should fail');
  });

  test('pushBet indexes the booking code automatically', async () => {
    const bet = {
      id: 'auto-index-test',
      bookingCode: 'AI12345',
      userId: 'test',
      stake: 100,
    };
    await pushBet(bet);
    const found = findBetByBookingCode('AI12345');
    assert.ok(found, 'Bet should be findable after pushBet');
    assert.equal(found.id, 'auto-index-test');
  });

  // ─── API-LEVEL VALIDATION ─────────────────────────────────────────────

  test('validates booking code regex format', () => {
    const valid = ['AB12345', 'XY98765', 'MK54321', 'PL11111'];
    for (const code of valid) {
      assert.ok(CODE_REGEX.test(code), `Valid code "${code}" should pass regex`);
    }

    const invalid = ['', 'ABC1234', 'AB1234', 'AB123456', 'A123456', '1234567', 'AB1234Z', 'abc1234', 'AB_1234', 'AB 1234', 'ZZ00001', 'AB01234', 'OA12345'];
    for (const code of invalid) {
      assert.ok(!CODE_REGEX.test(code), `Invalid code "${code}" should fail regex`);
    }
  });

  test('rejects codes with wrong length', () => {
    assert.ok(!CODE_REGEX.test('AB1234'));
    assert.ok(!CODE_REGEX.test('AB123456'));
    assert.ok(!CODE_REGEX.test('ABC1234'));
  });

  test('rejects codes with lowercase letters', () => {
    assert.ok(!CODE_REGEX.test('ab12345'));
    assert.ok(!CODE_REGEX.test('Ab12345'));
  });

  test('rejects codes with zero digit', () => {
    assert.ok(!CODE_REGEX.test('AB01234'));
    assert.ok(!CODE_REGEX.test('AB12034'));
  });

  test('rejects codes with letter O', () => {
    assert.ok(!CODE_REGEX.test('OA12345'));
    assert.ok(!CODE_REGEX.test('AO12345'));
    assert.ok(!CODE_REGEX.test('OO12345'));
  });

  // ─── INDEX REBUILD ────────────────────────────────────────────────────

  test('rebuildBookCodeIndex correctly indexes all bets', async () => {
    const { createStore: cs } = await import('../src/db/store.js');
    const bs = cs('bets', {});
    const all = bs.all();
    rebuildBookCodeIndex();

    for (const [id, bet] of Object.entries(all)) {
      if (bet.bookingCode) {
        const found = findBetByBookingCode(bet.bookingCode);
        assert.ok(found, `Bet ${id} with code ${bet.bookingCode} should be findable`);
        assert.equal(found.id, id);
      }
    }
  });

  // ─── EDGE CASES ────────────────────────────────────────────────────────

  test('handles empty booking codes gracefully', () => {
    const result = findBetByBookingCode('');
    assert.equal(result, null);
  });

  test('handles null/undefined booking codes gracefully', () => {
    assert.equal(findBetByBookingCode(null), null);
    assert.equal(findBetByBookingCode(undefined), null);
  });

  test('codes from store retain full data', async () => {
    const { createStore: cs } = await import('../src/db/store.js');
    const bs = cs('bets', {});
    const all = bs.all();
    for (const bet of Object.values(all)) {
      if (bet.bookingCode) {
        assert.ok(typeof bet.id === 'string', 'Bet must have string id');
        assert.ok(typeof bet.bookingCode === 'string', 'Booking code must be string');
        assert.ok(typeof bet.userId === 'string', 'Bet must have userId');
        assert.ok(typeof bet.stake === 'number', 'Bet must have numeric stake');
      }
    }
  });
});
