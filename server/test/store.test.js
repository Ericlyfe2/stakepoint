import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data-test');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';

// Point store files to a temp directory
process.env.PATHS = JSON.stringify({ data: DATA_DIR });

// Clean data dir before and after
function cleanData() {
  if (fs.existsSync(DATA_DIR)) {
    for (const f of fs.readdirSync(DATA_DIR)) {
      fs.unlinkSync(path.join(DATA_DIR, f));
    }
  }
}

describe('KV Store', () => {
  before(() => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cleanData();
  });

  after(() => {
    cleanData();
  });

  test('creates a store and persists data', async () => {
    const { createStore } = await import('../src/db/store.js');
    const store = createStore('test_users', {});
    const user = { id: 'test@test.com', email: 'test@test.com', balance: 100 };
    await store.setCritical('test@test.com', user);
    assert.equal(store.get('test@test.com').email, 'test@test.com');
  });

  test('setCritical survives process restart simulation', async () => {
    const { createStore } = await import('../src/db/store.js');
    const store = createStore('test_users', {});
    const data = store.get('test@test.com');
    assert.ok(data);
    assert.equal(data.balance, 100);
  });

  test('deleteCritical removes data permanently', async () => {
    const { createStore } = await import('../src/db/store.js');
    let store = createStore('test_delete', {});
    await store.setCritical('key1', { value: 42 });
    assert.ok(store.get('key1'));
    await store.deleteCritical('key1');
    assert.equal(store.get('key1'), undefined);
  });

  test('debounced writes work for non-critical data', async () => {
    cleanData();
    const { createStore } = await import('../src/db/store.js');
    const store = createStore('test_debounced', {});
    store.set('a', { x: 1 });
    store.set('b', { x: 2 });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(store.get('a').x, 1);
    assert.equal(store.get('b').x, 2);
  });
});

describe('Users', () => {
  before(async () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cleanData();
    // Re-init stores to get fresh state
    const { initStores } = await import('../src/db/store.js');
    await initStores();
  });

  after(() => cleanData());

  test('createUser creates and persists a user', async () => {
    const { createUser, findByEmail } = await import('../src/db/users.js');
    const u = await createUser({
      email: 'persist-test@example.com',
      displayName: 'Test User',
      passwordHash: '$2b$10$fakehash',
      balance: 500,
      country: 'GH',
      emailVerified: true,
    });
    assert.ok(u);
    assert.equal(u.email, 'persist-test@example.com');
    assert.equal(u.balance, 500);
  });

  test('findByEmail finds the created user', async () => {
    const { findByEmail } = await import('../src/db/users.js');
    const u = findByEmail('persist-test@example.com');
    assert.ok(u);
    assert.equal(u.displayName, 'Test User');
  });

  test('updateUser updates and persists', async () => {
    const { updateUser, findByEmail } = await import('../src/db/users.js');
    const u = await updateUser('persist-test@example.com', { balance: 1000 });
    assert.ok(u);
    assert.equal(u.balance, 1000);
    const fresh = findByEmail('persist-test@example.com');
    assert.equal(fresh.balance, 1000);
  });

  test('deleteUser removes user', async () => {
    const { deleteUser, findByEmail } = await import('../src/db/users.js');
    await deleteUser('persist-test@example.com');
    const u = findByEmail('persist-test@example.com');
    assert.equal(u, undefined);
  });

  test('createUser rejects duplicate email', async () => {
    const { createUser, deleteUser } = await import('../src/db/users.js');
    const email = `dupe-${Date.now()}@example.com`;
    await createUser({
      email,
      displayName: 'Original',
      passwordHash: '$2b$10$fakehash',
      emailVerified: true,
    });
    await assert.rejects(
      async () => createUser({
        email,
        displayName: 'Duplicate',
        passwordHash: '$2b$10$fakehash',
        emailVerified: true,
      }),
      /already exists/
    );
    await deleteUser(email);
  });

  test('findByGoogleId works', async () => {
    const { createUser, findByGoogleId, deleteUser } = await import('../src/db/users.js');
    await createUser({
      email: 'google@example.com',
      displayName: 'Google User',
      googleId: 'google-12345',
      emailVerified: true,
    });
    const u = findByGoogleId('google-12345');
    assert.ok(u);
    assert.equal(u.email, 'google@example.com');
    await deleteUser('google@example.com');
  });
});
