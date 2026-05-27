import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertIndexedDbAvailable,
  cleanupExpiredRecords,
  deleteRecordsBefore,
  getRecord,
  listRecords,
  replaceRecords,
  requestToPromise,
  upsertRecord,
} from '../js/storage.js';

function createRequest() {
  return {
    onsuccess: null,
    onerror: null,
    result: undefined,
    error: null,
  };
}

function finishRequest(request, result) {
  queueMicrotask(() => {
    request.result = result;
    request.onsuccess?.({ target: request });
  });
  return request;
}

class FakeObjectStore {
  constructor(records) {
    this.records = records;
  }

  get(date) {
    return finishRequest(createRequest(), this.records.get(date));
  }

  getAll() {
    return finishRequest(createRequest(), Array.from(this.records.values()));
  }

  put(record) {
    this.records.set(record.date, { ...record });
    return finishRequest(createRequest(), record.date);
  }

  clear() {
    this.records.clear();
    return finishRequest(createRequest(), undefined);
  }

  delete(date) {
    this.records.delete(date);
    return finishRequest(createRequest(), undefined);
  }
}

class FakeTransaction {
  constructor(records) {
    this.records = records;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.error = null;
    this.aborted = false;
    queueMicrotask(() => this.complete());
  }

  objectStore() {
    return new FakeObjectStore(this.records);
  }

  abort() {
    this.aborted = true;
    this.error = new Error('Transaction aborted');
    this.onabort?.({ target: this });
  }

  complete() {
    if (!this.aborted) {
      this.oncomplete?.({ target: this });
    }
  }
}

class FakeDatabase {
  constructor(records) {
    this.records = records;
    this.objectStoreNames = {
      contains: () => true,
    };
    this.closed = false;
  }

  createObjectStore() {}

  transaction() {
    return new FakeTransaction(this.records);
  }

  close() {
    this.closed = true;
  }
}

function installFakeIndexedDb() {
  const records = new Map();

  global.window = {
    indexedDB: {
      open() {
        const request = createRequest();
        queueMicrotask(() => {
          request.result = new FakeDatabase(records);
          request.onupgradeneeded?.({ target: request });
          request.onsuccess?.({ target: request });
        });
        return request;
      },
    },
  };
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
