// storage.js — IndexedDB wrapper
const Storage = (() => {
  const DB_NAME    = 'venue_manager';
  const DB_VERSION = 1;

  // ── STORE NAME CONSTANTS ───────────────────────────────────────────────────
  const S = {
    EQUIPMENT : 'equipment',
    SUPPLIES  : 'supplies',
    DAILY     : 'daily_records',
    ESNAP     : 'equip_snapshots',
    SSNAP     : 'supply_snapshots',
    ISSUES    : 'equip_issues',
    LOGS      : 'op_logs',
    SETTINGS  : 'settings',
  };

  let _db = null;

  // ── INIT ───────────────────────────────────────────────────────────────────
  function init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;

        // equipment — id only
        if (!db.objectStoreNames.contains(S.EQUIPMENT)) {
          db.createObjectStore(S.EQUIPMENT, { keyPath: 'id' });
        }
        // supplies — id only
        if (!db.objectStoreNames.contains(S.SUPPLIES)) {
          db.createObjectStore(S.SUPPLIES, { keyPath: 'id' });
        }
        // daily_records — index: date (unique per day)
        if (!db.objectStoreNames.contains(S.DAILY)) {
          const st = db.createObjectStore(S.DAILY, { keyPath: 'id' });
          st.createIndex('date', 'date', { unique: true });
        }
        // equip_snapshots — index: date, equipmentId
        if (!db.objectStoreNames.contains(S.ESNAP)) {
          const st = db.createObjectStore(S.ESNAP, { keyPath: 'id' });
          st.createIndex('date',        'date');
          st.createIndex('equipmentId', 'equipmentId');
        }
        // supply_snapshots — index: date, supplyId
        if (!db.objectStoreNames.contains(S.SSNAP)) {
          const st = db.createObjectStore(S.SSNAP, { keyPath: 'id' });
          st.createIndex('date',     'date');
          st.createIndex('supplyId', 'supplyId');
        }
        // equip_issues — index: date, equipmentId, isArchived
        if (!db.objectStoreNames.contains(S.ISSUES)) {
          const st = db.createObjectStore(S.ISSUES, { keyPath: 'id' });
          st.createIndex('date',        'date');
          st.createIndex('equipmentId', 'equipmentId');
          st.createIndex('isArchived',  'isArchived');
        }
        // op_logs — index: date
        if (!db.objectStoreNames.contains(S.LOGS)) {
          const st = db.createObjectStore(S.LOGS, { keyPath: 'id' });
          st.createIndex('date', 'date');
        }
        // settings — keyPath: key  (key-value store)
        if (!db.objectStoreNames.contains(S.SETTINGS)) {
          db.createObjectStore(S.SETTINGS, { keyPath: 'key' });
        }
      };

      req.onsuccess = e => { _db = e.target.result; resolve(); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function getAll(storeName) {
    return new Promise((resolve, reject) => {
      const req = _db.transaction(storeName, 'readonly')
                     .objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  function getAllByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const req = _db.transaction(storeName, 'readonly')
                     .objectStore(storeName).index(indexName).getAll(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  function get(storeName, key) {
    return new Promise((resolve, reject) => {
      const req = _db.transaction(storeName, 'readonly')
                     .objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  function put(storeName, record) {
    return new Promise((resolve, reject) => {
      const req = _db.transaction(storeName, 'readwrite')
                     .objectStore(storeName).put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  function remove(storeName, key) {
    return new Promise((resolve, reject) => {
      const req = _db.transaction(storeName, 'readwrite')
                     .objectStore(storeName).delete(key);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  }

  // ── EXPORT ────────────────────────────────────────────────────────────────
  async function exportAll() {
    const [equipment, supplies, daily_records,
           equip_snapshots, supply_snapshots,
           equip_issues, op_logs, settingsArr] = await Promise.all([
      getAll(S.EQUIPMENT), getAll(S.SUPPLIES),  getAll(S.DAILY),
      getAll(S.ESNAP),     getAll(S.SSNAP),
      getAll(S.ISSUES),    getAll(S.LOGS),       getAll(S.SETTINGS),
    ]);
    // settings → plain object for excel.js sheet serialiser
    const settings = {};
    settingsArr.forEach(s => { settings[s.key] = s.value; });
    return { settings, equipment, supplies, daily_records,
             equip_snapshots, supply_snapshots, equip_issues, op_logs };
  }

  // ── IMPORT ────────────────────────────────────────────────────────────────
  async function importAll(data) {
    await clearAll();
    const pairs = [
      [S.EQUIPMENT, data.equipment        || []],
      [S.SUPPLIES,  data.supplies         || []],
      [S.DAILY,     data.daily_records    || []],
      [S.ESNAP,     data.equip_snapshots  || []],
      [S.SSNAP,     data.supply_snapshots || []],
      [S.ISSUES,    data.equip_issues     || []],
      [S.LOGS,      data.op_logs          || []],
      [S.SETTINGS,  data.settings         || []],  // [{key, value}, ...]
    ];
    for (const [store, items] of pairs) {
      for (const item of items) await put(store, item);
    }
  }

  // ── CLEAR ALL ─────────────────────────────────────────────────────────────
  function clearAll() {
    return new Promise((resolve, reject) => {
      const names = Object.values(S);
      const tx    = _db.transaction(names, 'readwrite');
      names.forEach(n => tx.objectStore(n).clear());
      tx.oncomplete = () => resolve();
      tx.onerror    = e  => reject(e.target.error);
    });
  }

  return { S, init, getAll, getAllByIndex, get, put, remove, exportAll, importAll, clearAll };
})();
