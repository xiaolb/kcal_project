import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertIndexedDbAvailable,
  cleanupExpiredRecords,
  deleteRecordsBefore,
  getRecord,
  listRecords,
  openDatabase,
  replaceRecords,
  requestToPromise,
  runTransaction,
  upsertRecord,
} from '../js/storage.js';
import { STORE_NAME } from '../js/constants.js';

function createRequest() {
  return {
    onsuccess: null,
    onerror: null,
    result: undefined,
    error: null,
  };
}

class FakeObjectStore {
  constructor(transaction) {
    this.transaction = transaction;
  }

  get(date) {
    return this.transaction.queueRequest(() => this.transaction.records.get(date));
  }

  getAll() {
    return this.transaction.queueRequest(() => Array.from(this.transaction.records.values()));
  }

  put(record) {
    return this.transaction.queueRequest(() => {
      this.transaction.records.set(record.date, { ...record });
      return record.date;
    });
  }

  clear() {
    return this.transaction.queueRequest(() => {
      this.transaction.records.clear();
      return undefined;
    });
  }

  delete(date) {
    return this.transaction.queueRequest(() => {
      this.transaction.records.delete(date);
      return undefined;
    });
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
    this.records = db.records;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.error = null;
    this.aborted = false;
    this.pendingRequests = 0;
    this.completionScheduled = false;
    this.scheduleCompletionIfIdle();
  }

  objectStore() {
    return new FakeObjectStore(this);
  }

  queueRequest(operation) {
    const request = createRequest();
    this.pendingRequests += 1;

    queueMicrotask(() => {
      if (this.aborted) {
        request.error = this.error;
        request.onerror?.({ target: request });
        this.pendingRequests -= 1;
        this.scheduleCompletionIfIdle();
        return;
      }

      if (this.db.closed) {
        request.error = new Error('Database closed before request completed');
        request.onerror?.({ target: request });
        this.error = request.error;
        this.onerror?.({ target: this });
        this.pendingRequests -= 1;
        return;
      }

      try {
        request.result = operation();
        request.onsuccess?.({ target: request });
      } catch (error) {
        request.error = error;
        this.error = error;
        request.onerror?.({ target: request });
        this.onerror?.({ target: this });
      } finally {
        this.pendingRequests -= 1;
        this.scheduleCompletionIfIdle();
      }
    });

    return request;
  }

  abort() {
    this.aborted = true;
    this.error = new Error('Transaction aborted');
    queueMicrotask(() => {
      this.onabort?.({ target: this });
    });
  }

  scheduleCompletionIfIdle() {
    if (this.completionScheduled) {
      return;
    }

    this.completionScheduled = true;
    queueMicrotask(() => {
      this.completionScheduled = false;

      if (this.pendingRequests === 0 && !this.aborted) {
        this.complete();
      } else if (this.pendingRequests > 0) {
        this.scheduleCompletionIfIdle();
      }
    });
  }

  complete() {
    if (!this.aborted) {
      this.oncomplete?.({ target: this });
    }
  }
}

class FakeDatabase {
  constructor(state) {
    this.state = state;
    this.records = state.records;
    this.objectStoreNames = {
      contains: (storeName) => this.state.createdStores.has(storeName),
    };
    this.closed = false;
  }

  createObjectStore(storeName, options) {
    this.state.createObjectStoreCalls.push([storeName, options]);
    this.state.createdStores.add(storeName);
  }

  transaction(storeName) {
    if (!this.state.createdStores.has(storeName)) {
      throw new Error(`Missing object store: ${storeName}`);
    }

    return new FakeTransaction(this);
  }

  close() {
    this.closed = true;
  }
}

function installFakeIndexedDb() {
  const state = {
    records: new Map(),
    createdStores: new Set(),
    createObjectStoreCalls: [],
  };

  global.window = {
    indexedDB: {
      open() {
        const request = createRequest();
        queueMicrotask(() => {
          request.result = new FakeDatabase(state);
          request.onupgradeneeded?.({ target: request });
          request.onsuccess?.({ target: request });
        });
        return request;
      },
    },
  };

  return state;
}

test.afterEach(() => {
  delete global.window;
});

test('assertIndexedDbAvailable throws when browser indexedDB is unavailable', () => {
  assert.throws(() => assertIndexedDbAvailable(), /INDEXED_DB_UNAVAILABLE/);
});

test('requestToPromise resolves and rejects IDB requests', async () => {
  const success = createRequest();
  const successPromise = requestToPromise(success);
  success.result = 42;
  success.onsuccess({ target: success });
  assert.equal(await successPromise, 42);

  const failure = createRequest();
  const failurePromise = requestToPromise(failure);
  failure.error = new Error('bad request');
  failure.onerror({ target: failure });
  await assert.rejects(failurePromise, /bad request/);
});

test('openDatabase creates the daily records object store during upgrade', async () => {
  const state = installFakeIndexedDb();

  const db = await openDatabase();
  db.close();

  assert.deepEqual(state.createObjectStoreCalls, [[STORE_NAME, { keyPath: 'date' }]]);
});

test('runTransaction waits for queued requests before closing the database and returns callback result', async () => {
  installFakeIndexedDb();
  const result = await runTransaction('readwrite', (store) => {
    store.put({
      date: '2026-05-26',
      calories: 50,
      updatedAt: '2026-05-26T00:00:00.000Z',
    });
    return 'stored';
  });

  assert.equal(result, 'stored');
  assert.deepEqual(await getRecord('2026-05-26'), {
    date: '2026-05-26',
    calories: 50,
    updatedAt: '2026-05-26T00:00:00.000Z',
  });
});

test('runTransaction synchronous callback errors reject with the original error without unhandled rejection', async () => {
  installFakeIndexedDb();
  const originalError = new Error('original failure');
  const unhandled = [];
  const onUnhandled = (reason) => {
    unhandled.push(reason);
  };

  process.once('unhandledRejection', onUnhandled);

  await assert.rejects(
    () => runTransaction('readwrite', () => {
      throw originalError;
    }),
    (error) => error === originalError,
  );
  await new Promise((resolve) => setImmediate(resolve));
  process.removeListener('unhandledRejection', onUnhandled);

  assert.deepEqual(unhandled, []);
});

test('storage adapter normalizes, replaces, lists, fetches, and deletes records', async () => {
  installFakeIndexedDb();

  const normalized = await upsertRecord({
    date: '2026-05-26',
    calories: '123.4',
    updatedAt: '2026-05-26T01:02:03.004Z',
  });

  assert.deepEqual(normalized, {
    date: '2026-05-26',
    calories: 123.4,
    updatedAt: '2026-05-26T01:02:03.004Z',
  });
  assert.deepEqual(await getRecord('2026-05-26'), normalized);
  await assert.rejects(() => upsertRecord({ date: 'bad' }), /Invalid record/);

  await replaceRecords([
    { date: '2025-05-26', calories: 10, updatedAt: '2025-05-26T00:00:00.000Z' },
    { date: '2025-05-27', calories: '20', updatedAt: '2025-05-27T00:00:00.000Z' },
  ]);

  assert.deepEqual(await listRecords(), [
    { date: '2025-05-26', calories: 10, updatedAt: '2025-05-26T00:00:00.000Z' },
    { date: '2025-05-27', calories: 20, updatedAt: '2025-05-27T00:00:00.000Z' },
  ]);

  assert.equal(await deleteRecordsBefore('2025-05-27'), 1);
  assert.deepEqual(await listRecords(), [
    { date: '2025-05-27', calories: 20, updatedAt: '2025-05-27T00:00:00.000Z' },
  ]);
});

test('replaceRecords rejects invalid records without clearing existing data', async () => {
  installFakeIndexedDb();

  await replaceRecords([
    { date: '2025-05-26', calories: 10, updatedAt: '2025-05-26T00:00:00.000Z' },
  ]);

  await assert.rejects(
    () => replaceRecords([
      { date: '2025-05-27', calories: 20, updatedAt: '2025-05-27T00:00:00.000Z' },
      { date: 'bad', calories: 30, updatedAt: '2025-05-28T00:00:00.000Z' },
    ]),
    /Invalid record/,
  );

  assert.deepEqual(await listRecords(), [
    { date: '2025-05-26', calories: 10, updatedAt: '2025-05-26T00:00:00.000Z' },
  ]);
});

test('cleanupExpiredRecords removes records before the retention cutoff date', async () => {
  installFakeIndexedDb();

  await replaceRecords([
    { date: '2025-05-26', calories: 10, updatedAt: '2025-05-26T00:00:00.000Z' },
    { date: '2025-05-27', calories: 20, updatedAt: '2025-05-27T00:00:00.000Z' },
  ]);

  assert.equal(await cleanupExpiredRecords('2026-05-27'), 1);
  assert.deepEqual(await listRecords(), [
    { date: '2025-05-27', calories: 20, updatedAt: '2025-05-27T00:00:00.000Z' },
  ]);
});
