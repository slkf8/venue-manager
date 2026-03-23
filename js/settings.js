// settings.js — Settings & management sheets
const Settings = (() => {
  let _isClearing = false;

  // ── EQUIPMENT MANAGEMENT ──────────────────────────────────────────────────
  function openEquipManage() {
    const sheetId = 'sheet-equip-manage';
    UI.openSheet(sheetId, _equipManageBody(), { title: '設備管理', tall: true });
    _bindEquipManage(sheetId);
  }

  function _equipManageBody() {
    const { equipment } = State.data;
    const active = equipment.filter(e => e.isActive);
    const deleted = equipment.filter(e => !e.isActive);
    return `
      <div class="manage-add-row">
        <input class="manage-input" type="text" id="new-equip-name" placeholder="新設備名稱" maxlength="20">
        <button class="btn btn-primary btn-sm" id="add-equip-btn">新增</button>
      </div>
      <div class="manage-list" id="equip-manage-list">
        ${active.map(e => `
          <div class="list-item-manage">
            <span class="manage-name">${e.name}</span>
            <div class="manage-actions">
              <button class="btn btn-sm btn-ghost rename-equip-btn" data-id="${e.id}" data-name="${e.name}">改名</button>
              <button class="btn btn-sm btn-danger-ghost delete-equip-btn" data-id="${e.id}" data-name="${e.name}">刪除</button>
            </div>
          </div>
        `).join('') || '<p class="empty-hint">無設備</p>'}
      </div>
      ${deleted.length ? `
        <div class="archive-toggle" id="deleted-equip-toggle" onclick="this.classList.toggle('open'); document.getElementById('deleted-equip-list').classList.toggle('collapsed')">
          已刪除設備（${deleted.length}）▾
        </div>
        <div class="manage-list collapsed" id="deleted-equip-list">
          ${deleted.map(e => `
            <div class="list-item-manage deleted">
              <span class="manage-name">${e.name}</span>
              <button class="btn btn-sm btn-ghost restore-equip-btn" data-id="${e.id}" data-name="${e.name}">恢復</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  }

  function _bindEquipManage(sheetId) {
    const sheet = document.getElementById(sheetId);
    if (!sheet) return;

    sheet.querySelector('#add-equip-btn')?.addEventListener('click', async () => {
      const input = sheet.querySelector('#new-equip-name');
      const name = input.value.trim();
      if (!name) return UI.toast('請輸入設備名稱', 'warn');
      const ok = await State.addEquipment(name);
      if (!ok) return UI.toast('名稱已存在', 'warn');
      input.value = '';
      UI.updateSheetBody(sheetId, _equipManageBody());
      _bindEquipManage(sheetId);
      Dashboard.refreshEquipmentGrid();
      Inspection.refreshAll();
      UI.toast(`已新增：${name}`);
    });

    sheet.querySelectorAll('.rename-equip-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const oldName = btn.dataset.name;
        _openRenameSheet('equip', id, oldName, async (newName) => {
          const ok = await State.renameEquipment(id, newName);
          if (!ok) { UI.toast('名稱已存在', 'warn'); return false; }
          UI.updateSheetBody(sheetId, _equipManageBody());
          _bindEquipManage(sheetId);
          Dashboard.refreshEquipmentGrid();
          Inspection.refreshAll();
          UI.toast(`已改名為：${newName}`);
          return true;
        });
      });
    });

    sheet.querySelectorAll('.delete-equip-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        const ok = await UI.confirm({ title: '刪除設備', message: `確定刪除「${name}」？`, confirmText: '刪除', danger: true });
        if (!ok) return;
        await State.deleteEquipment(id);
        UI.updateSheetBody(sheetId, _equipManageBody());
        _bindEquipManage(sheetId);
        Dashboard.refreshEquipmentGrid();
        Inspection.refreshAll();
        Issues.refreshIssuesList();
        UI.toast(`已刪除：${name}`);
      });
    });

    sheet.querySelectorAll('.restore-equip-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        await State.restoreEquipment(id);
        UI.updateSheetBody(sheetId, _equipManageBody());
        _bindEquipManage(sheetId);
        Dashboard.refreshEquipmentGrid();
        Inspection.refreshAll();
        UI.toast(`已恢復：${name}`);
      });
    });
  }

  // ── SUPPLY MANAGEMENT ──────────────────────────────────────────────────────
  function openSupplyManage() {
    const sheetId = 'sheet-supply-manage';
    UI.openSheet(sheetId, _supplyManageBody(), { title: '消耗品管理', tall: true });
    _bindSupplyManage(sheetId);
  }

  function _supplyManageBody() {
    const { supplies } = State.data;
    const active = supplies.filter(s => s.isActive);
    const deleted = supplies.filter(s => !s.isActive);
    return `
      <div class="manage-section-title">新增消耗品</div>
      <div class="manage-add-col">
        <input class="manage-input" type="text" id="new-supply-name" placeholder="消耗品名稱" maxlength="20">
        <div class="seg-wrap">
          <button class="seg-pill active" data-new-supply-type="quantity">數量式</button>
          <button class="seg-pill" data-new-supply-type="status">狀態式</button>
        </div>
        <div id="new-supply-qty-fields">
          <div class="manage-row">
            <input class="manage-input half" type="text" id="new-supply-unit" placeholder="單位（如：桶）" maxlength="6">
            <input class="manage-input half" type="number" id="new-supply-threshold" placeholder="警戒值" min="0">
          </div>
          <input class="manage-input" type="number" id="new-supply-init-qty" placeholder="初始數量" min="0">
        </div>
        <div id="new-supply-status-fields" style="display:none">
          <div class="seg-wrap">
            ${['正常','偏少','急需補充'].map(s => `<button class="seg-pill${s === '正常' ? ' active' : ''}" data-new-init-status="${s}">${s}</button>`).join('')}
          </div>
        </div>
        <button class="btn btn-primary btn-sm" id="add-supply-btn">新增</button>
      </div>
      <div class="manage-list" id="supply-manage-list">
        ${active.map(s => `
          <div class="list-item-manage">
            <div class="manage-supply-info">
              <span class="manage-name">${s.name}</span>
              <span class="manage-type-badge">${s.type === 'quantity' ? `數量式 · ${s.unit} · 警戒值${s.threshold}` : '狀態式'}</span>
            </div>
            <div class="manage-actions">
              <button class="btn btn-sm btn-outline change-type-btn" data-id="${s.id}">修改類型</button>
              <button class="btn btn-sm btn-ghost rename-supply-btn" data-id="${s.id}" data-name="${s.name}">改名</button>
              <button class="btn btn-sm btn-danger-ghost delete-supply-btn" data-id="${s.id}" data-name="${s.name}">刪除</button>
            </div>
          </div>
        `).join('') || '<p class="empty-hint">無消耗品</p>'}
      </div>
      ${deleted.length ? `
        <div class="archive-toggle" id="deleted-supply-toggle" onclick="this.classList.toggle('open'); document.getElementById('deleted-supply-list').classList.toggle('collapsed')">
          已刪除消耗品（${deleted.length}）▾
        </div>
        <div class="manage-list collapsed" id="deleted-supply-list">
          ${deleted.map(s => `
            <div class="list-item-manage deleted">
              <span class="manage-name">${s.name}</span>
              <button class="btn btn-sm btn-ghost restore-supply-btn" data-id="${s.id}" data-name="${s.name}">恢復</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  }

  function _bindSupplyManage(sheetId) {
    const sheet = document.getElementById(sheetId);
    if (!sheet) return;
    let newType = 'quantity';
    let newInitStatus = '正常';

    sheet.querySelectorAll('[data-new-supply-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        newType = btn.dataset.newSupplyType;
        sheet.querySelectorAll('[data-new-supply-type]').forEach(b => b.classList.toggle('active', b === btn));
        sheet.querySelector('#new-supply-qty-fields').style.display = newType === 'quantity' ? '' : 'none';
        sheet.querySelector('#new-supply-status-fields').style.display = newType === 'status' ? '' : 'none';
      });
    });

    sheet.querySelectorAll('[data-new-init-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        newInitStatus = btn.dataset.newInitStatus;
        sheet.querySelectorAll('[data-new-init-status]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    sheet.querySelector('#add-supply-btn')?.addEventListener('click', async () => {
      const name = sheet.querySelector('#new-supply-name').value.trim();
      if (!name) return UI.toast('請輸入名稱', 'warn');
      let meta = { type: newType };
      let initQty = null, initStatus = null;
      if (newType === 'quantity') {
        meta.unit = sheet.querySelector('#new-supply-unit').value.trim() || '個';
        meta.threshold = parseInt(sheet.querySelector('#new-supply-threshold').value) || 0;
        initQty = parseInt(sheet.querySelector('#new-supply-init-qty').value) || 0;
      } else {
        initStatus = newInitStatus;
      }
      const ok = await State.addSupply(name, meta, initQty, initStatus);
      if (!ok) return UI.toast('名稱已存在', 'warn');
      UI.updateSheetBody(sheetId, _supplyManageBody());
      _bindSupplyManage(sheetId);
      Dashboard.refreshSupplyGrid();
      Inspection.refreshAll();
      UI.toast(`已新增：${name}`);
    });

    sheet.querySelectorAll('.rename-supply-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const oldName = btn.dataset.name;
        _openRenameSheet('supply', id, oldName, async (newName) => {
          const ok = await State.renameSupply(id, newName);
          if (!ok) { UI.toast('名稱已存在', 'warn'); return false; }
          UI.updateSheetBody(sheetId, _supplyManageBody());
          _bindSupplyManage(sheetId);
          Dashboard.refreshSupplyGrid();
          Inspection.refreshAll();
          UI.toast(`已改名為：${newName}`);
          return true;
        });
      });
    });

    sheet.querySelectorAll('.delete-supply-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        const ok = await UI.confirm({ title: '刪除消耗品', message: `確定刪除「${name}」？`, confirmText: '刪除', danger: true });
        if (!ok) return;
        await State.deleteSupply(id);
        UI.updateSheetBody(sheetId, _supplyManageBody());
        _bindSupplyManage(sheetId);
        Dashboard.refreshSupplyGrid();
        Inspection.refreshAll();
        UI.toast(`已刪除：${name}`);
      });
    });

    sheet.querySelectorAll('.restore-supply-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        await State.restoreSupply(id);
        UI.updateSheetBody(sheetId, _supplyManageBody());
        _bindSupplyManage(sheetId);
        Dashboard.refreshSupplyGrid();
        Inspection.refreshAll();
        UI.toast(`已恢復：${name}`);
      });
    });

    sheet.querySelectorAll('.change-type-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const supply = State.data.supplies.find(s => s.id === id);
        if (!supply) return;
        // Block type change if any historical snapshots exist for this supply
        const snaps = await Storage.getAllByIndex(Storage.S.SSNAP, 'supplyId', id);
        if (snaps.length) {
          await UI.confirm({
            title: '無法修改類型',
            message: '此消耗品已有歷史記錄，為避免影響歷史顯示，不能直接修改類型。\n\n若需改類型，請新增新的消耗品項目。',
            confirmText: '了解',
            cancelText: '關閉',
          });
          return;
        }
        _openChangeTypeSheet(id, supply, sheetId);
      });
    });
  }

  // ── CHANGE SUPPLY TYPE SHEET ──────────────────────────────────────────────
  function _openChangeTypeSheet(supplyId, supply, parentSheetId) {
    const changeSheetId = 'sheet-change-type';
    const currentType = supply.type;
    let newInitStatus = '正常';
    let newInitQty = 0;

    const bodyHTML = currentType === 'quantity' ? `
      <div class="sheet-field-group">
        <div class="sheet-label">目前類型</div>
        <p style="font-size:14px;color:var(--text-secondary);margin-bottom:4px">數量式 · ${supply.unit} · 警戒值 ${supply.threshold}</p>
      </div>
      <div class="sheet-field-group">
        <div class="sheet-label">改為狀態式 — 初始狀態</div>
        <div class="seg-wrap">
          ${['正常','偏少','急需補充'].map(st => `<button class="seg-pill${st === '正常' ? ' active' : ''}" data-ct-status="${st}">${st}</button>`).join('')}
        </div>
      </div>
      <div class="warn-box">歷史快照保留，今日起顯示改為狀態式</div>
      <button class="btn btn-primary btn-block" id="ct-save-btn">確認修改</button>
    ` : `
      <div class="sheet-field-group">
        <div class="sheet-label">目前類型</div>
        <p style="font-size:14px;color:var(--text-secondary);margin-bottom:4px">狀態式</p>
      </div>
      <div class="sheet-field-group">
        <div class="sheet-label">改為數量式</div>
        <div class="manage-row">
          <input class="manage-input half" type="text" id="ct-unit" placeholder="單位（如：桶）" maxlength="6">
          <input class="manage-input half" type="number" id="ct-threshold" placeholder="警戒值" min="0">
        </div>
        <div class="sheet-label" style="margin-top:8px">初始數量</div>
        ${UI.renderStepper('ct-qty', 0, 0, 9999)}
      </div>
      <div class="warn-box">歷史快照保留，今日起顯示改為數量式</div>
      <button class="btn btn-primary btn-block" id="ct-save-btn">確認修改</button>
    `;

    UI.openSheet(changeSheetId, bodyHTML, { title: `修改類型：${supply.name}` });
    const cs = document.getElementById(changeSheetId);

    if (currentType === 'quantity') {
      cs.querySelectorAll('[data-ct-status]').forEach(btn => {
        btn.addEventListener('click', () => {
          newInitStatus = btn.dataset.ctStatus;
          cs.querySelectorAll('[data-ct-status]').forEach(b => b.classList.toggle('active', b === btn));
        });
      });
      cs.querySelector('#ct-save-btn').addEventListener('click', async () => {
        await State.updateSupplyType(supplyId, { type: 'status', unit: '', threshold: 0 }, null, newInitStatus);
        UI.closeSheet(changeSheetId);
        UI.updateSheetBody(parentSheetId, _supplyManageBody());
        _bindSupplyManage(parentSheetId);
        Dashboard.refreshSupplyGrid();
        Inspection.refreshAll();
        UI.toast(`${supply.name} 已改為狀態式`);
      });
    } else {
      UI.initStepper('ct-qty', 0, 0, 9999, v => newInitQty = v);
      cs.querySelector('#ct-save-btn').addEventListener('click', async () => {
        const unit = cs.querySelector('#ct-unit').value.trim() || '個';
        const threshold = parseInt(cs.querySelector('#ct-threshold').value) || 0;
        await State.updateSupplyType(supplyId, { type: 'quantity', unit, threshold }, newInitQty, null);
        UI.closeSheet(changeSheetId);
        UI.updateSheetBody(parentSheetId, _supplyManageBody());
        _bindSupplyManage(parentSheetId);
        Dashboard.refreshSupplyGrid();
        Inspection.refreshAll();
        UI.toast(`${supply.name} 已改為數量式`);
      });
    }
  }

  // ── RENAME SHEET ──────────────────────────────────────────────────────────
  function _openRenameSheet(type, _id, oldName, onSave) {
    const sheetId = 'sheet-rename';
    const label = type === 'equip' ? '設備' : '消耗品';
    UI.openSheet(sheetId, `
      <div class="sheet-field-group">
        <div class="sheet-label">新名稱</div>
        <input class="manage-input" type="text" id="rename-input" value="${oldName}" maxlength="20">
      </div>
      <button class="btn btn-primary btn-block" id="rename-save-btn">確認改名</button>
    `, { title: `修改${label}名稱` });

    document.getElementById(sheetId).querySelector('#rename-save-btn').addEventListener('click', async () => {
      const newName = document.getElementById('rename-input').value.trim();
      if (!newName || newName === oldName) return UI.closeSheet(sheetId);
      const ok = await onSave(newName);
      if (ok !== false) UI.closeSheet(sheetId);
    });
  }

  // ── BASE HEADCOUNT ─────────────────────────────────────────────────────────
  function openHeadcountSetting() {
    const sheetId = 'sheet-headcount-setting';
    const base = State.data.settings.globalHeadcountBase;
    let val = base;
    UI.openSheet(sheetId, `
      <div class="sheet-field-group">
        <div class="sheet-label">全局基準人數</div>
        ${UI.renderStepper('hc-base', base, 0, 999)}
        <div class="stepper-hint">新一天的「應到」預設值</div>
      </div>
      <button class="btn btn-primary btn-block" id="hc-base-save-btn">儲存</button>
    `, { title: '基準人數設定' });
    UI.initStepper('hc-base', base, 0, 999, v => val = v);
    document.getElementById(sheetId).querySelector('#hc-base-save-btn').addEventListener('click', async () => {
      await State.updateBaseHeadcount(val);
      UI.closeSheet(sheetId);
      UI.toast(`基準人數已設為 ${val}`);
    });
  }

  // ── CLEAR ALL DATA ─────────────────────────────────────────────────────────
  async function confirmClearAll() {
    if (_isClearing) return;
    _isClearing = true;
    const step1 = await UI.confirm({
      title: '⚠️ 清空全部資料',
      message: '此操作將永久移除裝置上的全部資料，包括所有記錄、設備、消耗品與設定。\n\n請確認你已匯出備份。',
      confirmText: '我已備份，繼續',
      danger: true,
    });
    if (!step1) { _isClearing = false; return; }
    const step2 = await UI.confirm({
      title: '最後確認',
      message: '真的要清空全部資料嗎？此操作無法還原。',
      confirmText: '確認清空',
      danger: true,
    });
    if (!step2) { _isClearing = false; return; }
    await Storage.clearAll();
    UI.toast('資料已清空，即將重新載入…');
    setTimeout(() => location.reload(), 1500);
  }

  return { openEquipManage, openSupplyManage, openHeadcountSetting, confirmClearAll };
})();
