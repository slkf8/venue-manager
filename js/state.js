// state.js — In-memory state + all write operations
const State = (() => {

  // ── REACTIVE DATA OBJECT ──────────────────────────────────────────────────
  // All UI modules read directly from State.data — never mutate it externally.
  const data = {
    today          : '',      // "YYYY-MM-DD"
    todayRecord    : null,    // DailyRecord object
    equipment      : [],      // all Equipment (active + inactive)
    supplies       : [],      // all Supply (active + inactive)
    todayESnap     : {},      // equipId → EquipSnapshot for today
    todaySSnap     : {},      // supplyId → SupplySnapshot for today
    activeIssues   : [],      // Issue[] where isArchived === false
    archivedIssues : [],      // Issue[] where isArchived === true
    settings       : { globalHeadcountBase: 34 },
  };

  // ── DEFAULT SEED DATA ─────────────────────────────────────────────────────
  const _DEFAULT_EQUIPMENT = ['廁所', '影印機', '燈', '飲水機', 'POS 機', '冷氣'];
  const _DEFAULT_SUPPLIES  = [
    { name: '紙杯', type: 'quantity', unit: '桶', threshold: 4 },
    { name: 'A4 紙', type: 'quantity', unit: '包', threshold: 4 },
    { name: '飲品', type: 'status' },
  ];

  // Old demo seed names — used for safe one-time migration
  const _OLD_EQUIP_NAMES   = ['冷氣', '投影機', '音響', '麥克風'];
  const _OLD_SUPPLY_NAMES  = ['衛生紙', '清潔用品'];

  function _matchesOldSeed(list, oldNames) {
    return list.length === oldNames.length &&
      list.every(item => item.isActive) &&
      oldNames.every(n => list.some(item => item.name === n));
  }

  // ── INITIALIZE ────────────────────────────────────────────────────────────
  async function initialize() {
    // 1. Settings
    const settingsArr = await Storage.getAll(Storage.S.SETTINGS);
    settingsArr.forEach(s => {
      if (s.key in data.settings) data.settings[s.key] = s.value;
    });
    data.settings.globalHeadcountBase = Number(data.settings.globalHeadcountBase) || 34;
    // Seed DB with default if key was absent (new install or post-clearAll)
    if (!settingsArr.some(s => s.key === 'globalHeadcountBase')) {
      await Storage.put(Storage.S.SETTINGS, { key: 'globalHeadcountBase', value: 34 });
    }

    // 2. Load equipment & supplies
    data.equipment = await Storage.getAll(Storage.S.EQUIPMENT);
    data.supplies  = await Storage.getAll(Storage.S.SUPPLIES);

    // 3. Safe migration: if data still matches old demo seed and no daily record
    //    exists (system was never actually used), replace with correct defaults.
    if (data.equipment.length || data.supplies.length) {
      const hasUsage = (await Storage.getAll(Storage.S.DAILY)).length > 0;
      if (!hasUsage) {
        if (_matchesOldSeed(data.equipment, _OLD_EQUIP_NAMES)) {
          for (const e of data.equipment) await Storage.remove(Storage.S.EQUIPMENT, e.id);
          data.equipment = [];
        }
        if (_matchesOldSeed(data.supplies, _OLD_SUPPLY_NAMES)) {
          for (const s of data.supplies) await Storage.remove(Storage.S.SUPPLIES, s.id);
          data.supplies = [];
        }
      }
    }

    // 4. Seed equipment if empty
    if (!data.equipment.length) {
      for (const name of _DEFAULT_EQUIPMENT) {
        const e = { id: Utils.genId(), name, isActive: true };
        await Storage.put(Storage.S.EQUIPMENT, e);
        data.equipment.push(e);
      }
    }

    // 5. Seed supplies if empty
    if (!data.supplies.length) {
      for (const s of _DEFAULT_SUPPLIES) {
        const supply = {
          id        : Utils.genId(),
          name      : s.name,
          isActive  : true,
          type      : s.type,
          unit      : s.unit      || '',
          threshold : s.threshold || 0,
        };
        await Storage.put(Storage.S.SUPPLIES, supply);
        data.supplies.push(supply);
      }
    }

    // 4. Today's date
    data.today = Utils.todayStr();

    // 5. Today's daily record (create if missing)
    const todayRecs = await Storage.getAllByIndex(Storage.S.DAILY, 'date', data.today);
    if (todayRecs.length) {
      data.todayRecord = todayRecs[0];
    } else {
      data.todayRecord = await _buildTodayDailyRecordFromLatest();
      await Storage.put(Storage.S.DAILY, data.todayRecord);
    }

    // 6. Seed today's snapshots from latest previous data, then load
    await _seedTodaySnapshotsFromLatest();
    await _loadSnapshots();
    await _loadIssues();
  }

  // ── RELOAD (public — used by history.js after editing past records) ───────
  async function reloadLists() {
    await _loadSnapshots();
    await _loadIssues();
    const recs = await Storage.getAllByIndex(Storage.S.DAILY, 'date', data.today);
    if (recs.length) data.todayRecord = recs[0];
  }

  async function _loadSnapshots() {
    const eSnaps = await Storage.getAllByIndex(Storage.S.ESNAP, 'date', data.today);
    data.todayESnap = {};
    eSnaps.forEach(s => { data.todayESnap[s.equipmentId] = s; });

    const sSnaps = await Storage.getAllByIndex(Storage.S.SSNAP, 'date', data.today);
    data.todaySSnap = {};
    sSnaps.forEach(s => { data.todaySSnap[s.supplyId] = s; });
  }

  async function _loadIssues() {
    const all = await Storage.getAll(Storage.S.ISSUES);
    data.activeIssues   = all.filter(i => !i.isArchived);
    data.archivedIssues = all.filter(i =>  i.isArchived);
  }

  // ── ENSURE DAILY RECORD AT DATE ───────────────────────────────────────────
  async function ensureDailyRecordAtDate(date) {
    const recs = await Storage.getAllByIndex(Storage.S.DAILY, 'date', date);
    if (recs.length) return recs[0];

    const rec = {
      id                : Utils.genId(),
      date,
      checkinDone       : false,
      checkinTime       : null,
      headcountExpected : data.settings.globalHeadcountBase,
      headcountActual   : null,
      headcountMissing  : null,
      headcountNote     : '',
    };

    await Storage.put(Storage.S.DAILY, rec);

    if (date === data.today) {
      data.todayRecord = rec;
    }

    return rec;
  }

  // ── CHECKIN ───────────────────────────────────────────────────────────────
  async function doCheckin() {
    if (!data.todayRecord) return;
    data.todayRecord.checkinDone = true;
    data.todayRecord.checkinTime = Utils.nowISO();
    await Storage.put(Storage.S.DAILY, data.todayRecord);
    await _log('今日打卡確認');
  }

  // ── EQUIPMENT SNAPSHOT ────────────────────────────────────────────────────
  async function updateEquipStatus(equipId, status, note) {
    let snap = data.todayESnap[equipId];
    const prevStatus = snap ? snap.status : null;
    if (snap) {
      snap.status = status;
      if (note !== null) snap.note = note;
    } else {
      snap = {
        id          : Utils.genId(),
        equipmentId : equipId,
        date        : data.today,
        status,
        note        : note || '',
      };
    }
    await Storage.put(Storage.S.ESNAP, snap);
    data.todayESnap[equipId] = snap;
    await _log(`設備狀態更新：${_equipName(equipId)} → ${status}`);

    // Auto-resolve latest active issue when status transitions to 正常
    if (prevStatus && prevStatus !== '正常' && status === '正常') {
      const latestIssue = data.activeIssues
        .filter(i => i.equipmentId === equipId)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || null;
      if (latestIssue) {
        await resolveIssue(latestIssue.id);
      }
    }
  }

  // ── SUPPLY SNAPSHOT ───────────────────────────────────────────────────────
  async function updateSupplySnap(supplyId, qty, status) {
    let snap = data.todaySSnap[supplyId];
    if (snap) {
      if (qty    !== null) snap.quantity = qty;
      if (status !== null) snap.status   = status;
    } else {
      snap = {
        id       : Utils.genId(),
        supplyId,
        date     : data.today,
        quantity : qty,
        status   : status || '正常',
      };
    }
    await Storage.put(Storage.S.SSNAP, snap);
    data.todaySSnap[supplyId] = snap;
  }

  // ── HISTORY SNAPSHOT UPSERT (single-date only; no future propagation) ─────
  async function upsertEquipSnapAtDate(date, equipId, status, note) {
    const snapsForDate = await Storage.getAllByIndex(Storage.S.ESNAP, 'date', date);
    let snap = snapsForDate.find(s => s.equipmentId === equipId) || null;

    if (snap) {
      snap.status = status;
      if (note !== undefined) snap.note = note;
    } else {
      snap = {
        id          : Utils.genId(),
        equipmentId : equipId,
        date,
        status,
        note        : note !== undefined ? note : '',
      };
    }

    await Storage.put(Storage.S.ESNAP, snap);

    if (date === data.today) {
      data.todayESnap[equipId] = snap;
    }

    return snap;
  }

  async function upsertSupplySnapAtDate(date, supplyId, qty, status) {
    const snapsForDate = await Storage.getAllByIndex(Storage.S.SSNAP, 'date', date);
    let snap = snapsForDate.find(s => s.supplyId === supplyId) || null;

    if (snap) {
      if (qty    !== null) snap.quantity = qty;
      if (status !== null) snap.status   = status;
    } else {
      snap = {
        id       : Utils.genId(),
        supplyId,
        date,
        quantity : qty,
        status   : status || '正常',
      };
    }

    await Storage.put(Storage.S.SSNAP, snap);

    if (date === data.today) {
      data.todaySSnap[supplyId] = snap;
    }

    return snap;
  }

  // ── ISSUES ────────────────────────────────────────────────────────────────
  async function addIssue(equipId, status, note) {
    const issue = {
      id          : Utils.genId(),
      equipmentId : equipId,
      status,
      note        : note || '',
      isArchived  : false,
      date        : data.today,
      createdAt   : Utils.nowISO(),
      completedAt : null,
      normalizedAt: null,
    };
    await Storage.put(Storage.S.ISSUES, issue);
    data.activeIssues.push(issue);
    await _log(`新增問題追蹤：${_equipName(equipId)}`);
    return issue;
  }

  async function updateIssue(issueId, status, note) {
    const issue = data.activeIssues.find(i => i.id === issueId)
               || data.archivedIssues.find(i => i.id === issueId);
    if (!issue) return;
    issue.status = status;
    issue.note   = note;
    if (status === '已處理' && !issue.completedAt) {
      issue.completedAt = Utils.nowISO();
    }
    await Storage.put(Storage.S.ISSUES, issue);
  }

  async function resolveIssue(issueId) {
    const idx = data.activeIssues.findIndex(i => i.id === issueId);
    if (idx === -1) return;
    const issue          = data.activeIssues[idx];
    issue.isArchived     = true;
    issue.normalizedAt   = Utils.nowISO();
    if (!issue.completedAt) issue.completedAt = issue.normalizedAt;
    await Storage.put(Storage.S.ISSUES, issue);
    data.activeIssues.splice(idx, 1);
    data.archivedIssues.push(issue);
    await _log(`問題已解決：${_equipName(issue.equipmentId)}`);
  }

  // ── EQUIPMENT MANAGEMENT ──────────────────────────────────────────────────
  async function addEquipment(name) {
    if (data.equipment.find(e => e.isActive && e.name === name)) return false;
    const equip = { id: Utils.genId(), name, isActive: true };
    await Storage.put(Storage.S.EQUIPMENT, equip);
    data.equipment.push(equip);
    await _log(`新增設備：${name}`);
    return true;
  }

  async function renameEquipment(id, newName) {
    if (data.equipment.find(e => e.isActive && e.name === newName && e.id !== id)) return false;
    const equip = data.equipment.find(e => e.id === id);
    if (!equip) return false;
    const oldName = equip.name;
    equip.name = newName;
    await Storage.put(Storage.S.EQUIPMENT, equip);
    await _log(`設備改名：${oldName} → ${newName}`);
    return true;
  }

  async function deleteEquipment(id) {
    const equip = data.equipment.find(e => e.id === id);
    if (!equip) return;
    equip.isActive = false;
    await Storage.put(Storage.S.EQUIPMENT, equip);
    await _log(`刪除設備：${equip.name}`);
  }

  async function restoreEquipment(id) {
    const equip = data.equipment.find(e => e.id === id);
    if (!equip) return;
    equip.isActive = true;
    await Storage.put(Storage.S.EQUIPMENT, equip);
    await _log(`恢復設備：${equip.name}`);
  }

  // ── SUPPLY MANAGEMENT ────────────────────────────────────────────────────
  async function addSupply(name, meta, initQty, initStatus) {
    if (data.supplies.find(s => s.isActive && s.name === name)) return false;
    const supply = {
      id        : Utils.genId(),
      name,
      isActive  : true,
      type      : meta.type,
      unit      : meta.unit      || '',
      threshold : meta.threshold || 0,
    };
    await Storage.put(Storage.S.SUPPLIES, supply);
    data.supplies.push(supply);
    // Create today's snapshot with initial value
    if (meta.type === 'quantity') {
      await updateSupplySnap(supply.id, initQty ?? 0, null);
    } else {
      await updateSupplySnap(supply.id, null, initStatus || '正常');
    }
    await _log(`新增消耗品：${name}`);
    return true;
  }

  async function renameSupply(id, newName) {
    if (data.supplies.find(s => s.isActive && s.name === newName && s.id !== id)) return false;
    const supply = data.supplies.find(s => s.id === id);
    if (!supply) return false;
    const oldName = supply.name;
    supply.name = newName;
    await Storage.put(Storage.S.SUPPLIES, supply);
    await _log(`消耗品改名：${oldName} → ${newName}`);
    return true;
  }

  async function deleteSupply(id) {
    const supply = data.supplies.find(s => s.id === id);
    if (!supply) return;
    supply.isActive = false;
    await Storage.put(Storage.S.SUPPLIES, supply);
    await _log(`刪除消耗品：${supply.name}`);
  }

  async function restoreSupply(id) {
    const supply = data.supplies.find(s => s.id === id);
    if (!supply) return;
    supply.isActive = true;
    await Storage.put(Storage.S.SUPPLIES, supply);
    await _log(`恢復消耗品：${supply.name}`);
  }

  // ── SUPPLY TYPE CHANGE ───────────────────────────────────────────────────
  async function updateSupplyType(id, newMeta, initQty, initStatus) {
    const supply = data.supplies.find(s => s.id === id);
    if (!supply) return false;
    const oldLabel = supply.type === 'quantity' ? '數量式' : '狀態式';
    supply.type      = newMeta.type;
    supply.unit      = newMeta.unit      || '';
    supply.threshold = newMeta.threshold || 0;
    await Storage.put(Storage.S.SUPPLIES, supply);
    // Update today's snapshot to match the new type
    if (newMeta.type === 'quantity') {
      await updateSupplySnap(id, initQty ?? 0, null);
    } else {
      await updateSupplySnap(id, null, initStatus || '正常');
    }
    const newLabel = newMeta.type === 'quantity' ? '數量式' : '狀態式';
    await _log(`消耗品類型變更：${supply.name}（${oldLabel} → ${newLabel}）`);
    return true;
  }

  // ── HEADCOUNT ────────────────────────────────────────────────────────────
  async function updateHeadcount(exp, act, note) {
    if (!data.todayRecord) return;
    data.todayRecord.headcountExpected = exp;
    data.todayRecord.headcountActual   = act;
    data.todayRecord.headcountMissing  = act !== null ? Math.max(0, exp - act) : null;
    data.todayRecord.headcountNote     = note;
    await Storage.put(Storage.S.DAILY, data.todayRecord);
  }

  async function updateBaseHeadcount(val) {
    data.settings.globalHeadcountBase = val;
    await Storage.put(Storage.S.SETTINGS, { key: 'globalHeadcountBase', value: val });
  }

  // ── CASCADE (history edits propagate to subsequent snapshots) ─────────────
  // Temporary keep for compatibility until history.js is switched to the new
  // single-date upsert APIs.
  async function cascadeEquipSnap(date, equipId, status, note) {
    const all      = await Storage.getAll(Storage.S.ESNAP);
    const affected = all.filter(s => s.equipmentId === equipId && s.date >= date);

    // Ensure the exact edit-date always has a snapshot (may be absent even when
    // later dates have one — e.g. user edits a day that was never recorded).
    if (!affected.some(s => s.date === date)) {
      affected.push({ id: Utils.genId(), equipmentId: equipId, date, status: '', note: '' });
    }

    for (const snap of affected) {
      snap.status = status;
      snap.note   = note !== undefined ? note : snap.note;
      await Storage.put(Storage.S.ESNAP, snap);
    }

    // Sync in-memory today snap if affected
    if (data.today >= date) await _loadSnapshots();
  }

  async function cascadeSupplySnap(date, supplyId, qty, status) {
    const all      = await Storage.getAll(Storage.S.SSNAP);
    const affected = all.filter(s => s.supplyId === supplyId && s.date >= date);

    // Ensure the exact edit-date always has a snapshot
    if (!affected.some(s => s.date === date)) {
      affected.push({ id: Utils.genId(), supplyId, date, quantity: null, status: '正常' });
    }

    for (const snap of affected) {
      if (qty    !== null) snap.quantity = qty;
      if (status !== null) snap.status   = status;
      await Storage.put(Storage.S.SSNAP, snap);
    }

    if (data.today >= date) await _loadSnapshots();
  }

  // ── SEED TODAY FROM LATEST PREVIOUS SNAPSHOT ──────────────────────────────
  async function _seedTodaySnapshotsFromLatest() {
    // Today's existing equipment snapshots
    const todayESnaps = await Storage.getAllByIndex(Storage.S.ESNAP, 'date', data.today);
    const todayEquipMap = {};
    todayESnaps.forEach(s => { todayEquipMap[s.equipmentId] = true; });

    // Today's existing supply snapshots
    const todaySSnaps = await Storage.getAllByIndex(Storage.S.SSNAP, 'date', data.today);
    const todaySupplyMap = {};
    todaySSnaps.forEach(s => { todaySupplyMap[s.supplyId] = true; });

    // Load all historical snapshots once
    const allESnaps = await Storage.getAll(Storage.S.ESNAP);
    const allSSnaps = await Storage.getAll(Storage.S.SSNAP);

    // Seed equipment snapshots for today if missing
    for (const equip of data.equipment.filter(e => e.isActive)) {
      if (todayEquipMap[equip.id]) continue;

      const latest = allESnaps
        .filter(s => s.equipmentId === equip.id && s.date < data.today)
        .sort((a, b) => b.date.localeCompare(a.date))[0];

      if (!latest) continue;

      const newSnap = {
        id: Utils.genId(),
        equipmentId: equip.id,
        date: data.today,
        status: latest.status,
        note: latest.note || '',
      };

      await Storage.put(Storage.S.ESNAP, newSnap);
    }

    // Seed supply snapshots for today if missing
    for (const supply of data.supplies.filter(s => s.isActive)) {
      if (todaySupplyMap[supply.id]) continue;

      const latest = allSSnaps
        .filter(s => s.supplyId === supply.id && s.date < data.today)
        .sort((a, b) => b.date.localeCompare(a.date))[0];

      if (!latest) continue;

      const newSnap = {
        id: Utils.genId(),
        supplyId: supply.id,
        date: data.today,
        quantity: latest.quantity ?? null,
        status: latest.status || '正常',
      };

      await Storage.put(Storage.S.SSNAP, newSnap);
    }
  }

  // ── BUILD TODAY DAILY RECORD FROM LATEST ───────────────────────────────────
  async function _buildTodayDailyRecordFromLatest() {
    const allDaily = await Storage.getAll(Storage.S.DAILY);
    const latest = allDaily
      .filter(r => r.date < data.today)
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    const expected =
      latest && latest.headcountExpected !== null && latest.headcountExpected !== undefined
        ? latest.headcountExpected
        : data.settings.globalHeadcountBase;

    return {
      id                 : Utils.genId(),
      date               : data.today,
      checkinDone        : false,
      checkinTime        : null,
      headcountExpected  : expected,
      headcountActual    : null,
      headcountMissing   : null,
      headcountNote      : '',
    };
  }

  // ── PRIVATE HELPERS ───────────────────────────────────────────────────────
  function _equipName(id) {
    const e = data.equipment.find(x => x.id === id);
    return e ? e.name : id;
  }

  async function _log(message) {
    const entry = {
      id        : Utils.genId(),
      date      : data.today,
      message,
      createdAt : Utils.nowISO(),
    };
    await Storage.put(Storage.S.LOGS, entry);
  }

  async function addLogAtDate(date, message) {
    const entry = {
      id        : Utils.genId(),
      date,
      message,
      createdAt : Utils.nowISO(),
    };
    await Storage.put(Storage.S.LOGS, entry);
    return entry;
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────
  return {
    data,
    initialize,
    reloadLists,
    doCheckin,
    updateEquipStatus,
    updateSupplySnap,
    upsertEquipSnapAtDate,
    upsertSupplySnapAtDate,
    addIssue,
    updateIssue,
    resolveIssue,
    addEquipment,   renameEquipment,   deleteEquipment,   restoreEquipment,
    addSupply,      renameSupply,      deleteSupply,      restoreSupply,      updateSupplyType,
    updateHeadcount,
    updateBaseHeadcount,
    cascadeEquipSnap,
    cascadeSupplySnap,
    ensureDailyRecordAtDate,
    addLogAtDate,
  };
})();