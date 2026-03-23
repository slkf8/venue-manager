// excel.js — SheetJS export & import
const Excel = (() => {
  const MARKER = '__venue_mgmt_v1__';
  let _isExporting = false;
  let _isImporting = false;

  // ── EXPORT ────────────────────────────────────────────────────────────────
  async function exportAll() {
    if (_isExporting) return;
    _isExporting = true;
    try {
      const data = await Storage.exportAll();
      const wb = XLSX.utils.book_new();

      // Sheet: meta
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['marker', MARKER],
        ['exportedAt', Utils.nowISO()],
        ['version', '1'],
      ]), 'meta');

      // Sheet: settings
      const settingsRows = Object.entries(data.settings).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['key', 'value'], ...settingsRows]), 'settings');

      // Helpers: array store → sheet
      const arraySheet = (arr, name) => {
        if (!arr.length) {
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['(empty)']]), name);
          return;
        }
        const keys = Object.keys(arr[0]);
        const rows = arr.map(item => keys.map(k => {
          const v = item[k];
          return typeof v === 'object' && v !== null ? JSON.stringify(v) : v ?? '';
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([keys, ...rows]), name);
      };

      arraySheet(data.equipment, 'equipment');
      arraySheet(data.supplies, 'supplies');
      arraySheet(data.daily_records, 'daily_records');
      arraySheet(data.equip_snapshots, 'equip_snapshots');
      arraySheet(data.supply_snapshots, 'supply_snapshots');
      arraySheet(data.equip_issues, 'equip_issues');
      arraySheet(data.op_logs, 'op_logs');

      const filename = `venue_backup_${Utils.todayStr()}.xlsx`;
      XLSX.writeFile(wb, filename);
      UI.toast(`✅ 已匯出：${filename}`);
    } catch (err) {
      console.error(err);
      UI.toast('匯出失敗：' + err.message, 'warn');
    } finally {
      _isExporting = false;
    }
  }

  // ── IMPORT ────────────────────────────────────────────────────────────────
  function triggerImport() {
    if (_isImporting) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async e => {
      _isImporting = true;
      const file = e.target.files[0];
      if (!file) { _isImporting = false; return; }
      try {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array' });
        // validate marker
        const meta = _sheetToKV(wb.Sheets['meta']);
        if (meta.marker !== MARKER) {
          UI.toast('格式不符，只接受系統自家匯出檔案', 'warn');
          return;
        }
        const ok = await UI.confirm({
          title: '確認匯入',
          message: '匯入將覆蓋所有本地資料，請確認你已做好備份。',
          confirmText: '確認覆蓋',
          danger: true,
        });
        if (!ok) return;
        await _doImport(wb);
        UI.toast('✅ 匯入成功，即將重新載入…');
        setTimeout(() => location.reload(), 1500);
      } catch (err) {
        console.error(err);
        UI.toast('匯入失敗：' + err.message, 'warn');
      } finally {
        _isImporting = false;
      }
    };
    input.click();
  }

  async function _doImport(wb) {
    const settings = _sheetToKV(wb.Sheets['settings']);
    const equipment = _sheetToArr(wb.Sheets['equipment']);
    const supplies = _sheetToArr(wb.Sheets['supplies']);
    const daily_records = _sheetToArr(wb.Sheets['daily_records']);
    const equip_snapshots = _sheetToArr(wb.Sheets['equip_snapshots']);
    const supply_snapshots = _sheetToArr(wb.Sheets['supply_snapshots']);
    const equip_issues = _sheetToArr(wb.Sheets['equip_issues']);
    const op_logs = _sheetToArr(wb.Sheets['op_logs']);

    // Parse booleans and numbers — restore null fields that xlsx serialises as ''
    equipment.forEach(e => {
      e.isActive = e.isActive === true || e.isActive === 'true';
    });
    supplies.forEach(s => {
      s.isActive  = s.isActive === true || s.isActive === 'true';
      if (s.threshold !== undefined) s.threshold = Number(s.threshold);
      // note: currentQuantity never existed in schema — no coercion needed
    });
    daily_records.forEach(r => {
      r.checkinDone      = r.checkinDone === true || r.checkinDone === 'true';
      r.checkinTime      = r.checkinTime      || null;
      r.headcountMissing = (r.headcountMissing !== '' && r.headcountMissing !== null && r.headcountMissing !== undefined)
                           ? Number(r.headcountMissing) : null;
      if (r.headcountExpected !== '') r.headcountExpected = Number(r.headcountExpected);
      if (r.headcountActual !== '' && r.headcountActual !== null && r.headcountActual !== undefined) r.headcountActual = Number(r.headcountActual);
      else r.headcountActual = null;
    });
    // equip_snapshots have no quantity field — no numeric coercion needed
    supply_snapshots.forEach(s => {
      if (s.quantity !== undefined && s.quantity !== '') s.quantity = Number(s.quantity);
      else s.quantity = null;
    });
    equip_issues.forEach(i => {
      i.isArchived   = i.isArchived === true || i.isArchived === 'true';
      // Restore null timestamps that xlsx serialises as empty string
      if (!i.completedAt)  i.completedAt  = null;
      if (!i.normalizedAt) i.normalizedAt = null;
    });

    // settings store expects array of {key, value} objects
    const settingsArr = Object.entries(_kvToSettings(settings)).map(([key, value]) => ({ key, value }));

    await Storage.importAll({
      settings: settingsArr,
      equipment, supplies, daily_records,
      equip_snapshots, supply_snapshots,
      equip_issues, op_logs,
    });
  }

  // ── SHEET PARSERS ──────────────────────────────────────────────────────────
  function _sheetToArr(sheet) {
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length || rows[0]['(empty)'] !== undefined) return [];
    return rows;
  }

  function _sheetToKV(sheet) {
    if (!sheet) return {};
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const result = {};
    rows.forEach(([k, v]) => { if (k) result[k] = v; });
    return result;
  }

  function _kvToSettings(kv) {
    const result = {};
    Object.entries(kv).forEach(([k, v]) => {
      if (k === 'globalHeadcountBase') result[k] = Number(v);
      else result[k] = v;
    });
    return result;
  }

  return { exportAll, triggerImport };
})();
