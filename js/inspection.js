// inspection.js — Inspection module (equipment items, supplies, headcount)
const Inspection = (() => {

  // ── EQUIPMENT INSPECTION ──────────────────────────────────────────────────
  function renderEquipInspection() {
    const { equipment, todayESnap } = State.data;
    const active = equipment.filter(e => e.isActive);
    if (!active.length) return '<p class="empty-hint">尚未新增設備</p>';

    return active.map(e => {
      const snap = todayESnap[e.id];
      const status = snap ? snap.status : '正常';
      const statusClass = status === '正常' ? 'cs-normal' : status === '已處理' ? 'cs-normal' : status === '待處理' ? 'cs-warn' : 'cs-process';
      return `
        <div class="insp-item" data-equip-id="${e.id}">
          <div class="insp-item-left">
            <span class="insp-name">${e.name}</span>
            <span class="status-badge ${statusClass} insp-badge">${status}</span>
          </div>
          <div class="insp-actions">
            <button class="btn btn-sm btn-outline insp-ok-btn${status === '正常' ? ' active' : ''}" data-id="${e.id}" data-action="ok">正常</button>
            <button class="btn btn-sm btn-warn-outline insp-warn-btn${['待處理','處理中'].includes(status) ? ' active' : ''}" data-id="${e.id}" data-action="warn">需處理</button>
          </div>
        </div>`;
    }).join('');
  }

  // ── SUPPLY INSPECTION ──────────────────────────────────────────────────────
  function renderSupplyInspection() {
    const { supplies, todaySSnap } = State.data;
    const active = supplies.filter(s => s.isActive);
    if (!active.length) return '<p class="empty-hint">尚未新增消耗品</p>';

    return active.map(s => {
      const snap = todaySSnap[s.id];
      if (s.type === 'quantity') {
        // No snap yet → neutral, same rule as dashboard (do not treat as 0)
        if (!snap || snap.quantity === null || snap.quantity === undefined) {
          return `
            <div class="insp-supply-item">
              <div class="insp-supply-left">
                <span class="insp-name">${s.name}</span>
                <span class="status-badge cs-normal">— ${s.unit}</span>
              </div>
              <button class="btn btn-sm btn-ghost" onclick="Dashboard.openSupplySheet('${s.id}')">調整</button>
            </div>`;
        }
        const qty   = Number(snap.quantity);   // coerce string from import
        const isLow = qty <= s.threshold;
        const label = isLow ? '急需補充' : '正常';
        const cls   = isLow ? 'cs-critical' : 'cs-normal';
        return `
          <div class="insp-supply-item">
            <div class="insp-supply-left">
              <span class="insp-name">${s.name}</span>
              <span class="status-badge ${cls}">${qty} ${s.unit} · ${label}</span>
            </div>
            <button class="btn btn-sm btn-ghost" onclick="Dashboard.openSupplySheet('${s.id}')">調整</button>
          </div>`;
      } else {
        const st = snap ? snap.status : '未記錄';
        const cls = st === '正常' ? 'cs-normal' : st === '偏少' ? 'cs-warn' : st === '未記錄' ? 'cs-normal' : 'cs-critical';
        return `
          <div class="insp-supply-item">
            <div class="insp-supply-left">
              <span class="insp-name">${s.name}</span>
              <span class="status-badge ${cls}">${st}</span>
            </div>
            <button class="btn btn-sm btn-ghost" onclick="Dashboard.openSupplySheet('${s.id}')">調整</button>
          </div>`;
      }
    }).join('');
  }

  // ── HEADCOUNT ──────────────────────────────────────────────────────────────
  function renderHeadcount() {
    const { todayRecord } = State.data;
    const expected = todayRecord ? todayRecord.headcountExpected : State.data.settings.globalHeadcountBase;
    const actual = todayRecord ? todayRecord.headcountActual : '';
    const missing = (actual !== null && actual !== '' && expected !== null)
      ? Math.max(0, expected - Number(actual)) : '—';
    const note = todayRecord ? (todayRecord.headcountNote || '') : '';

    return `
      <div class="headcount-grid">
        <div class="hc-cell">
          <div class="hc-label">應到</div>
          <div class="hc-value" id="hc-expected">${expected}</div>
        </div>
        <div class="hc-cell">
          <div class="hc-label">實到</div>
          <input class="hc-input" type="number" id="hc-actual" min="0" value="${actual !== null && actual !== '' ? actual : ''}" placeholder="輸入">
        </div>
        <div class="hc-cell">
          <div class="hc-label">缺少</div>
          <div class="hc-value" id="hc-missing">${missing}</div>
        </div>
      </div>
      <div class="hc-note-row">
        <input class="hc-note-input" id="hc-note" type="text" placeholder="備註（可選）" value="${note}">
      </div>
      <button class="btn btn-primary btn-sm" id="hc-save-btn">儲存人數</button>
    `;
  }

  function refreshAll() {
    const equipEl = document.getElementById('insp-equip-list');
    if (equipEl) equipEl.innerHTML = renderEquipInspection();
    const supplyEl = document.getElementById('insp-supply-list');
    if (supplyEl) supplyEl.innerHTML = renderSupplyInspection();
    const hcEl = document.getElementById('headcount-section');
    if (hcEl) hcEl.innerHTML = renderHeadcount();
    bindHeadcountEvents();
  }

  // ── EVENT BINDING ──────────────────────────────────────────────────────────
  function bindEquipInspectionEvents() {
    const container = document.getElementById('insp-equip-list');
    if (!container) return;
    container.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const newStatus = action === 'ok' ? '正常' : '待處理';
      await State.updateEquipStatus(id, newStatus, null);
      if (newStatus === '待處理') {
        await Issues.ensureIssue(id, '待處理');
        UI.toast('已標記需處理，已加入問題追蹤');
      } else if (newStatus === '正常') {
        await Issues.resolveByEquip(id);
      }
      refreshAll();
      Dashboard.refreshEquipmentGrid();
      Issues.refreshIssuesList();
    });
  }

  function bindHeadcountEvents() {
    const actualInput = document.getElementById('hc-actual');
    const expectedEl = document.getElementById('hc-expected');
    const missingEl = document.getElementById('hc-missing');
    if (!actualInput) return;

    actualInput.addEventListener('input', () => {
      const exp = parseInt(expectedEl.textContent) || 0;
      const act = parseInt(actualInput.value);
      if (!isNaN(act)) missingEl.textContent = Math.max(0, exp - act);
      else missingEl.textContent = '—';
    });

    const saveBtn = document.getElementById('hc-save-btn');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const exp = parseInt(expectedEl.textContent) || 0;
        const actVal = actualInput.value.trim();
        const act = actVal === '' ? null : parseInt(actVal);
        const note = document.getElementById('hc-note').value.trim();
        await State.updateHeadcount(exp, act, note);
        UI.toast('人數已儲存');
      };
    }
  }

  function bindAll() {
    bindEquipInspectionEvents();
    bindHeadcountEvents();
  }

  return { renderEquipInspection, renderSupplyInspection, renderHeadcount, refreshAll, bindAll };
})();
