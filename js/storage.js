import { DB_NAME, DB_VERSION, STORE_NAME } from './constants.js';
import { getRetentionCutoffDateKey, parseDateKey } from './date-utils.js';
import { normalizeRecord } from './records.js';

const INDEXED_DB_UNAVAILABLE = '当前浏览器不支持 IndexedDB。';

/**
 * 判断值是否是 IndexedDB request。
 */
function isIdbRequest(value) {
  return value && typeof value === 'object' && 'onsuccess' in value && 'onerror' in value;
}

/**
 * 将事务回调返回值统一转为 Promise。
 */
function toCallbackPromise(value) {
  if (isIdbRequest(value)) {
    return requestToPromise(value);
  }

  if (value && typeof value.then === 'function') {
    return value;
  }

  return Promise.resolve(value);
}

/**
 * 确认当前浏览器环境可以使用 IndexedDB。
 */
export function assertIndexedDbAvailable() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error(INDEXED_DB_UNAVAILABLE);
  }
}

/**
 * 将 IndexedDB request 包装成 Promise。
 */
export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 请求失败。'));
  });
}

/**
 * 打开应用数据库，并在首次创建时初始化对象仓库。
 */
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
    request.onerror = () => reject(request.error || new Error('IndexedDB 打开失败。'));
    request.onblocked = () => reject(new Error('IndexedDB 打开被阻止，请关闭其它标签页后重试。'));
  });
}

/**
 * 执行一次 IndexedDB 事务，等待事务完成后再返回结果。
 */
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
        reject(transaction.error || new Error('IndexedDB 事务失败。'));
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error || new Error('IndexedDB 事务已中止。'));
      };
    });

    let callbackResult;

    try {
      callbackResult = callback(store);
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // 事务可能已经完成或失效。
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
        // 事务可能已经完成或失效。
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
      // 保留原始错误，忽略关闭数据库时的附带失败。
    }
    throw error;
  }
}

/**
 * 按日期读取单条记录。
 */
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

/**
 * 读取全部本地记录。
 */
export async function listRecords() {
  let records = [];
  await runTransaction('readonly', (store) => (
    requestToPromise(store.getAll()).then((result) => {
      records = result;
    })
  ));

  return records;
}

/**
 * 新增或覆盖一条日期记录。
 */
export async function upsertRecord(record) {
  const normalized = normalizeRecord(record);

  if (!normalized) {
    throw new Error('记录格式无效。');
  }

  await runTransaction('readwrite', (store) => store.put(normalized));

  return normalized;
}

/**
 * 用给定记录整体替换本地记录，写入前会先完整校验。
 */
export async function replaceRecords(records) {
  if (!Array.isArray(records)) {
    throw new Error('记录列表必须是数组。');
  }

  const normalizedRecords = records.map((record) => {
    const normalized = normalizeRecord(record);

    if (!normalized) {
      throw new Error('记录格式无效。');
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

/**
 * 删除早于指定日期的记录，并返回删除数量。
 */
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

/**
 * 按一年保留策略清理过期记录。
 */
export function cleanupExpiredRecords(todayKey) {
  return deleteRecordsBefore(getRetentionCutoffDateKey(todayKey));
}
