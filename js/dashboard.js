// dashboard.js — Equipment & Supply card grids with edit sheets
const Dashboard = (() => {

  // ── HELPERS ────────────────────────────────────────────────────────────────
  function _equipStatusClass(status) {
    const map = { '正常': 's-normal', '待處理': 's-warn', '處理中': 's-process', '已處理': 's-normal' };
    return map[status] || 's-normal';
  }
  function _equipBadgeClass(status) {
    const map = { '正常': 'cs-normal', '待處理': 'cs-warn', '處理中': 'cs-process', '已處理': 'cs-normal' };
    return map[status] || 'cs-normal';
  }
  // Single source of truth for supply display — both cardClass and label
  // come from the same computed values, preventing colour/text mismatch.
  function _supplyInfo(supply, snap) {
    if (supply.type === 'quantity') {
      // Guard: no snapshot yet → neutral, not critical
      if (!snap || snap.quantity === null || snap.quantity === undefined) {
        return { cardClass: 's-normal', display: `— ${supply.unit}` };
      }
      const q     = Number(snap.quantity);   // coerce string from import
      const isLow = q <= supply.threshold;
      return {
        cardClass : isLow ? 's-critical' : 's-normal',
        display   : `${q} ${supply.unit}<span class="card-sub">${isLow ? '急需補充' : '正常'}</span>`,
      };
    }
    // status type
    const st       = (snap && snap.status) ? snap.status : '未記錄';
    const classMap = { '正常': 's-normal', '偏少': 's-warn', '急需補充': 's-critical', '未記錄': 's-normal' };
    return { cardClass: classMap[st] || 's-normal', display: st };
  }

  // ── RENDER CARDS ──────────────────────────────────────────────────────────
  function renderEquipmentCards() {
    const { equipment, todayESnap } = State.data;
    const active = equipment.filter(e => e.isActive);
    if (!active.length) {
      return '<p class="empty-hint">尚未新增設備</p>';
    }
    return `<div class="card-grid">${active.map(e => {
      const snap = todayESnap[e.id];
      const status = snap ? snap.status : '正常';
      const sc = _equipStatusClass(status);
      const bc = _equipBadgeClass(status);
      return `
        <div class="item-card ${sc}" data-equip-id="${e.id}" onclick="Dashboard.openEquipSheet('${e.id}')">
          <div class="card-name">${e.name}</div>
          <div class="card-status"><span class="status-badge ${bc}">${status}</span></div>
        </div>`;
    }).join('')}</div>`;
  }

  function renderSupplyCards() {
    const { supplies, todaySSnap } = State.data;
    const active = supplies.filter(s => s.isActive);
    if (!active.length) {
      return '<p class="empty-hint">尚未新增消耗品</p>';
    }
    return `<div class="card-grid">${active.map(s => {
      const snap = todaySSnap[s.id];
      const { cardClass, display } = _supplyInfo(s, snap);
      return `
        <div class="item-card ${cardClass}" data-supply-id="${s.id}" onclick="Dashboard.openSupplySheet('${s.id}')">
          <div class="card-name">${s.name}</div>
          <div class="card-status">${display}</div>
        </div>`;
    }).join('')}</div>`;
  }

  function refreshEquipmentGrid() {
    const el = document.getElementById('equip-grid');
    if (el) el.innerHTML = renderEquipmentCards();
  }

  function refreshSupplyGrid() {
    const el = document.getElementById('supply-grid');
    if (el) el.innerHTML = renderSupplyCards();
  }

  // ── EQUIPMENT SHEET ────────────────────────────────────────────────────────
  function openEquipSheet(equipId) {
    const equip = State.data.equipment.find(e => e.id === equipId);
    if (!equip) return;
    const snap = State.data.todayESnap[equipId];
    const currentStatus = snap ? snap.status : '正常';
    const currentNote = snap ? (snap.note || '') : '';
    const statuses = ['正常', '待處理', '處理中', '已處理'];
    let selectedStatus = currentStatus;
    let noteVal = currentNote;

    const sheetId = 'sheet-equip-edit';
    const renderBody = () => `
      <div class="sheet-field-group">
        <div class="sheet-label">狀態</div>
        <div class="seg-wrap">
          ${statuses.map(s => `
            <button class="seg-pill${s === selectedStatus ? ' active' : ''}" data-status="${s}">${s}</button>
          `).join('')}
        </div>
      </div>
      <div class="sheet-field-group">
        <div class="sheet-label">備註（可選）</div>
        <textarea class="sheet-textarea" id="equip-note-input" rows="3" placeholder="留空也可以">${noteVal}</textarea>
      </div>
      <button class="btn btn-primary btn-block" id="equip-save-btn">儲存</button>
    `;

    UI.openSheet(sheetId, renderBody(), { title: equip.name });

    const sheet = document.getElementById(sheetId);

    // status pill clicks
    sheet.addEventListener('click', async e => {
      const pill = e.target.closest('[data-status]');
      if (pill) {
        selectedStatus = pill.dataset.status;
        sheet.querySelectorAll('.seg-pill').forEach(p => p.classList.toggle('active', p.dataset.status === selectedStatus));
      }
      if (e.target.id === 'equip-save-btn') {
        noteVal = sheet.querySelector('#equip-note-input').value.trim();
        await State.updateEquipStatus(equipId, selectedStatus, noteVal);
        // sync Issues
        if (['待處理', '處理中', '已處理'].includes(selectedStatus)) {
          await Issues.ensureIssue(equipId, selectedStatus);
        } else if (selectedStatus === '正常') {
          await Issues.resolveByEquip(equipId);
        }
        refreshEquipmentGrid();
        Inspection.refreshAll();
        Issues.refreshIssuesList();
        UI.closeSheet(sheetId);
        UI.toast('已儲存');
      }
    });
  }

  // ── SUPPLY SHEET ───────────────────────────────────────────────────────────
  function openSupplySheet(supplyId) {
    const supply = State.data.supplies.find(s => s.id === supplyId);
    if (!supply) return;
    const snap = State.data.todaySSnap[supplyId];
    const sheetId = 'sheet-supply-edit';

    if (supply.type === 'quantity') {
      let qty = snap ? snap.quantity : 0;
      const renderQtyBody = () => `
        <div class="sheet-field-group">
          <div class="sheet-label">剩餘數量（${supply.unit}）</div>
          ${UI.renderStepper('supply-qty', qty, 0, 9999)}
          <div class="stepper-hint">警戒值：${supply.threshold} ${supply.unit}</div>
        </div>
        <button class="btn btn-primary btn-block" id="supply-save-btn">儲存</button>
      `;
      UI.openSheet(sheetId, renderQtyBody(), { title: supply.name });
      UI.initStepper('supply-qty', qty, 0, 9999, v => qty = v);
      document.getElementById(sheetId).querySelector('#supply-save-btn').onclick = async () => {
        await State.updateSupplySnap(supplyId, qty, null);
        refreshSupplyGrid();
        Inspection.refreshAll();
        UI.closeSheet(sheetId);
        UI.toast('已儲存');
      };
    } else {
      const statuses = ['正常', '偏少', '急需補充'];
      let selectedStatus = snap ? snap.status : '正常';
      const renderStatusBody = () => `
        <div class="sheet-field-group">
          <div class="sheet-label">當前狀態</div>
          <div class="seg-wrap">
            ${statuses.map(s => `
              <button class="seg-pill${s === selectedStatus ? ' active' : ''}" data-status="${s}">${s}</button>
            `).join('')}
          </div>
        </div>
        <button class="btn btn-primary btn-block" id="supply-save-btn">儲存</button>
      `;
      UI.openSheet(sheetId, renderStatusBody(), { title: supply.name });
      const sheet = document.getElementById(sheetId);
      sheet.addEventListener('click', async e => {
        const pill = e.target.closest('[data-status]');
        if (pill) {
          selectedStatus = pill.dataset.status;
          sheet.querySelectorAll('.seg-pill').forEach(p => p.classList.toggle('active', p.dataset.status === selectedStatus));
        }
        if (e.target.id === 'supply-save-btn') {
          await State.updateSupplySnap(supplyId, null, selectedStatus);
          refreshSupplyGrid();
          Inspection.refreshAll();
          UI.closeSheet(sheetId);
          UI.toast('已儲存');
        }
      });
    }
  }

  return {
    renderEquipmentCards, renderSupplyCards,
    refreshEquipmentGrid, refreshSupplyGrid,
    openEquipSheet, openSupplySheet,
  };
})();
