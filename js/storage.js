import { DB_NAME, DB_VERSION, STORE_NAME } from './constants.js';
import { getRetentionCutoffDateKey, parseDateKey } from './date-utils.js';
import { normalizeRecord } from './records.js';

const INDEXED_DB_UNAVAILABLE = 'INDEXED_DB_UNAVAILABLE';

function isIdbRequest(value) {
  return value && typeof value === 'object' && 'onsuccess' in value && 'onerror' in value;
}

function toCallbackPromise(value) {
  if (isIdbRequest(value)) {
    return requestToPromise(value);
  }

  if (value && typeof value.then === 'function') {
    return value;
  }

  return Promise.resolve(value);
}

export function assertIndexedDbAvailable() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error(INDEXED_DB_UNAVAILABLE);
  }
}

export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

export function openDatabase() {
  assertIndexedDbAvailable();

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'date' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

export async function runTransaction(mode, callback) {
  const db = await openDatabase();

  try {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    const transactionPromise = new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error('IndexedDB transaction failed'));
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error || new Error('IndexedDB transaction aborted'));
      };
    });

    let callbackResult;

    try {
      callbackResult = callback(store);
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be complete or inactive.
      }
      await transactionPromise.catch(() => {});
      throw error;
    }

    let result;

    try {
      result = await toCallbackPromise(callbackResult);
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be complete or inactive.
      }
      await transactionPromise.catch(() => {});
      throw error;
    }

    await transactionPromise;
    return result;
  } catch (error) {
    try {
      db.close();
    } catch {
      // Ignore close failures while surfacing the original error.
    }
    throw error;
  }
}

export async function getRecord(date) {
  parseDateKey(date);

  let record;
  await runTransaction('readonly', (store) => (
    requestToPromise(store.get(date)).then((result) => {
      record = result || null;
    })
  ));

  return record;
}

export async function listRecords() {
  let records = [];
  await runTransaction('readonly', (store) => (
    requestToPromise(store.getAll()).then((result) => {
      records = result;
    })
  ));

  return records;
}

export async function upsertRecord(record) {
  const normalized = normalizeRecord(record);

  if (!normalized) {
    throw new Error('Invalid record');
  }

  await runTransaction('readwrite', (store) => store.put(normalized));

  return normalized;
}

export async function replaceRecords(records) {
  if (!Array.isArray(records)) {
    throw new Error('Records must be an array.');
  }

  const normalizedRecords = records.map((record) => {
    const normalized = normalizeRecord(record);

    if (!normalized) {
      throw new Error('Invalid record');
    }

    return normalized;
  });

  await runTransaction('readwrite', (store) => {
    store.clear();
    for (const record of normalizedRecords) {
      store.put(record);
    }
  });

  return normalizedRecords;
}

export async function deleteRecordsBefore(cutoffDate) {
  parseDateKey(cutoffDate);

  const records = await listRecords();
  const recordsToDelete = records.filter((record) => record.date < cutoffDate);

  if (recordsToDelete.length === 0) {
    return 0;
  }

  await runTransaction('readwrite', (store) => {
    for (const record of recordsToDelete) {
      store.delete(record.date);
    }
  });

  return recordsToDelete.length;
}

export function cleanupExpiredRecords(todayKey) {
  return deleteRecordsBefore(getRetentionCutoffDateKey(todayKey));
}
