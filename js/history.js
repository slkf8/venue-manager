// history.js — Date picker + history bottom sheet
const History = (() => {

  async function open(dateStr) {
    if (!dateStr) return;
    const sheetId = 'sheet-history';
    UI.openSheet(sheetId, '<div class="loading-hint">載入中…</div>', { title: `歷史記錄：${Utils.formatDateShort(dateStr)}`, tall: true });
    const content = await _buildHistoryContent(dateStr);
    UI.updateSheetBody(sheetId, content);
    _bindHistoryEvents(sheetId, dateStr);
  }

  // ── BUILD CONTENT ─────────────────────────────────────────────────────────
  async function _buildHistoryContent(date) {
    const record = await Storage.getAllByIndex(Storage.S.DAILY, 'date', date);
    const rec = record[0] || null;
    const eSnaps = await Storage.getAllByIndex(Storage.S.ESNAP, 'date', date);
    const sSnaps = await Storage.getAllByIndex(Storage.S.SSNAP, 'date', date);
    const allIssues = await Storage.getAll(Storage.S.ISSUES);
    const logs = await Storage.getAllByIndex(Storage.S.LOGS, 'date', date);
    const equipment = State.data.equipment;
    const supplies = State.data.supplies;

    const eSnapMap = {};
    eSnaps.forEach(s => eSnapMap[s.equipmentId] = s);
    const sSnapMap = {};
    sSnaps.forEach(s => sSnapMap[s.supplyId] = s);

    return `
      <!-- 打卡 -->
      <div class="hist-section">
        <div class="hist-section-title">📋 打卡</div>
        <div class="hist-checkin">
          <label class="hist-field-label">打卡狀態</label>
          <div class="seg-wrap">
            <button class="seg-pill${rec && rec.checkinDone ? ' active' : ''}" data-hist-checkin="true">已打卡</button>
            <button class="seg-pill${!(rec && rec.checkinDone) ? ' active' : ''}" data-hist-checkin="false">未打卡</button>
          </div>
          ${rec && rec.checkinTime ? `<div class="hist-meta">打卡時間：${Utils.formatDateTime(rec.checkinTime)}</div>` : ''}
        </div>
      </div>

      <!-- 人數 -->
      <div class="hist-section">
        <div class="hist-section-title">👥 人數</div>
        <div class="headcount-grid">
          <div class="hc-cell">
            <div class="hc-label">應到</div>
            <input class="hc-input" type="number" id="hist-expected" value="${rec ? rec.headcountExpected : ''}" min="0">
          </div>
          <div class="hc-cell">
            <div class="hc-label">實到</div>
            <input class="hc-input" type="number" id="hist-actual" value="${rec && rec.headcountActual !== null && rec.headcountActual !== undefined ? rec.headcountActual : ''}" min="0">
          </div>
          <div class="hc-cell">
            <div class="hc-label">缺少</div>
            <div class="hc-value" id="hist-missing">${rec && rec.headcountActual !== null && rec.headcountActual !== undefined ? Math.max(0, (rec.headcountExpected || 0) - rec.headcountActual) : '—'}</div>
          </div>
        </div>
        <input class="hc-note-input" type="text" id="hist-hc-note" placeholder="備註" value="${rec ? (rec.headcountNote || '') : ''}">
        <button class="btn btn-primary btn-sm hist-hc-save" data-date="${date}">儲存人數</button>
      </div>

      <!-- 設備 -->
      <div class="hist-section">
        <div class="hist-section-title">🔧 設備</div>
        <div class="hist-cascade-warn">⚠️ 修改設備 / 消耗品記錄將同步影響後續日期</div>
        ${equipment.filter(e => eSnapMap[e.id]).map(e => {
          const snap = eSnapMap[e.id];
          return `
            <div class="hist-equip-item" data-equip-id="${e.id}" data-date="${date}">
              <div class="hist-item-name">${e.name}</div>
              <div class="seg-wrap small">
                ${['正常','待處理','處理中','已處理'].map(s => `
                  <button class="seg-pill${snap.status === s ? ' active' : ''}" data-hist-equip-status="${s}">${s}</button>
                `).join('')}
              </div>
              <input class="hist-note-input" type="text" placeholder="備註" value="${snap.note || ''}">
              <button class="btn btn-sm btn-primary hist-equip-save">儲存</button>
            </div>`;
        }).join('') || '<p class="empty-hint">無設備記錄</p>'}
      </div>

      <!-- 消耗品 -->
      <div class="hist-section">
        <div class="hist-section-title">📦 消耗品</div>
        ${supplies.filter(s => sSnapMap[s.id]).map(s => {
          const snap = sSnapMap[s.id];
          if (s.type === 'quantity') {
            return `
              <div class="hist-supply-item" data-supply-id="${s.id}" data-date="${date}" data-type="quantity">
                <div class="hist-item-name">${s.name}（${s.unit}）</div>
                <div class="stepper" id="stepper-hist-${s.id}">
                  <button class="stepper-btn" data-action="dec">−</button>
                  <span class="stepper-val">${snap.quantity ?? 0}</span>
                  <button class="stepper-btn" data-action="inc">+</button>
                </div>
                <button class="btn btn-sm btn-primary hist-supply-save">儲存</button>
              </div>`;
          } else {
            return `
              <div class="hist-supply-item" data-supply-id="${s.id}" data-date="${date}" data-type="status">
                <div class="hist-item-name">${s.name}</div>
                <div class="seg-wrap small">
                  ${['正常','偏少','急需補充'].map(st => `
                    <button class="seg-pill${snap.status === st ? ' active' : ''}" data-hist-supply-status="${st}">${st}</button>
                  `).join('')}
                </div>
                <button class="btn btn-sm btn-primary hist-supply-save">儲存</button>
              </div>`;
          }
        }).join('') || '<p class="empty-hint">無消耗品記錄</p>'}
      </div>

      <!-- 設備問題 -->
      <div class="hist-section">
        <div class="hist-section-title">⚠️ 設備問題記錄</div>
        ${_renderHistIssues(allIssues, date, equipment)}
      </div>

      <!-- 操作記錄 -->
      <div class="hist-section">
        <div class="hist-section-title">📝 操作記錄</div>
        ${logs.length
          ? logs.map(l => `<div class="log-item"><span class="log-time">${Utils.formatTime(l.createdAt)}</span> ${l.message}</div>`).join('')
          : '<p class="empty-hint">無操作記錄</p>'
        }
      </div>
    `;
  }

  function _renderHistIssues(allIssues, date, equipment) {
    const relevant = allIssues.filter(i => {
      const created = i.createdAt ? i.createdAt.slice(0, 10) : '';
      return created === date;
    });
    if (!relevant.length) return '<p class="empty-hint">當天無設備問題記錄</p>';
    return relevant.map(i => {
      const e = equipment.find(x => x.id === i.equipmentId);
      const name = e ? e.name : i.equipmentId;
      return `<div class="hist-issue-item">
        <strong>${name}</strong> — ${i.status}
        ${i.note ? `<br><span class="hist-meta">${i.note}</span>` : ''}
        <br><span class="hist-meta">建立 ${Utils.formatDateTime(i.createdAt)}${i.completedAt ? ' · 完成 ' + Utils.formatDateTime(i.completedAt) : ''}${i.normalizedAt ? ' · 恢復 ' + Utils.formatDateTime(i.normalizedAt) : ''}</span>
      </div>`;
    }).join('');
  }

  // ── BIND EVENTS ───────────────────────────────────────────────────────────
  function _bindHistoryEvents(sheetId, date) {
    const sheet = document.getElementById(sheetId);
    if (!sheet) return;

    // Headcount actual → auto-calc missing
    const histActual = sheet.querySelector('#hist-actual');
    const histExpected = sheet.querySelector('#hist-expected');
    const histMissing = sheet.querySelector('#hist-missing');
    if (histActual && histExpected && histMissing) {
      histActual.addEventListener('input', () => {
        const exp = parseInt(histExpected.value) || 0;
        const act = parseInt(histActual.value);
        histMissing.textContent = isNaN(act) ? '—' : Math.max(0, exp - act);
      });
    }

    // Save headcount
    sheet.querySelector('.hist-hc-save')?.addEventListener('click', async () => {
      const exp = parseInt(sheet.querySelector('#hist-expected').value) || 0;
      const actVal = sheet.querySelector('#hist-actual').value;
      const act = actVal === '' ? null : parseInt(actVal);
      const note = sheet.querySelector('#hist-hc-note').value.trim();
      const rec = (await Storage.getAllByIndex(Storage.S.DAILY, 'date', date))[0];
      if (rec) {
        rec.headcountExpected = exp;
        rec.headcountActual = act;
        rec.headcountMissing = act !== null ? Math.max(0, exp - act) : null;
        rec.headcountNote = note;
        await Storage.put(Storage.S.DAILY, rec);
        if (date === State.data.today) await State.reloadLists();
      }
      UI.toast('人數已儲存');
    });

    // Checkin toggle
    sheet.querySelectorAll('[data-hist-checkin]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const done = btn.dataset.histCheckin === 'true';
        sheet.querySelectorAll('[data-hist-checkin]').forEach(b => b.classList.toggle('active', b === btn));
        const rec = (await Storage.getAllByIndex(Storage.S.DAILY, 'date', date))[0];
        if (rec) {
          rec.checkinDone = done;
          if (done && !rec.checkinTime) rec.checkinTime = Utils.nowISO();
          await Storage.put(Storage.S.DAILY, rec);
          if (date === State.data.today) {
            State.data.todayRecord = rec;
            Checkin.refreshCheckinBar();
          }
        }
        UI.toast('打卡狀態已更新');
      });
    });

    // Equipment status + save
    sheet.querySelectorAll('.hist-equip-item').forEach(item => {
      const equipId = item.dataset.equipId;
      let selStatus = item.querySelector('.seg-pill.active')?.dataset.histEquipStatus || '正常';

      item.querySelectorAll('[data-hist-equip-status]').forEach(pill => {
        pill.addEventListener('click', () => {
          selStatus = pill.dataset.histEquipStatus;
          item.querySelectorAll('[data-hist-equip-status]').forEach(p => p.classList.toggle('active', p === pill));
        });
      });

      item.querySelector('.hist-equip-save')?.addEventListener('click', async () => {
        const note = item.querySelector('.hist-note-input').value.trim();
        await State.cascadeEquipSnap(date, equipId, selStatus, note);
        // Sync Issues with the cascaded (now-current) status
        if (['待處理', '處理中', '已處理'].includes(selStatus)) {
          await Issues.ensureIssue(equipId, selStatus);
        } else if (selStatus === '正常') {
          await Issues.resolveByEquip(equipId);
        }
        Dashboard.refreshEquipmentGrid();
        Inspection.refreshAll();
        Issues.refreshIssuesList();
        UI.toast('設備記錄已儲存並同步後續日期');
      });
    });

    // Supply stepper + save
    sheet.querySelectorAll('.hist-supply-item').forEach(item => {
      const supplyId = item.dataset.supplyId;
      const type = item.dataset.type;
      let selStatus = item.querySelector('.seg-pill.active')?.dataset.histSupplyStatus || '正常';
      let qty = parseInt(item.querySelector('.stepper-val')?.textContent) || 0;

      if (type === 'quantity') {
        item.querySelector('.stepper')?.addEventListener('click', e => {
          const btn = e.target.closest('.stepper-btn');
          if (!btn) return;
          if (btn.dataset.action === 'inc') qty = Math.min(9999, qty + 1);
          else qty = Math.max(0, qty - 1);
          item.querySelector('.stepper-val').textContent = qty;
        });
      } else {
        item.querySelectorAll('[data-hist-supply-status]').forEach(pill => {
          pill.addEventListener('click', () => {
            selStatus = pill.dataset.histSupplyStatus;
            item.querySelectorAll('[data-hist-supply-status]').forEach(p => p.classList.toggle('active', p === pill));
          });
        });
      }

      item.querySelector('.hist-supply-save')?.addEventListener('click', async () => {
        if (type === 'quantity') {
          await State.cascadeSupplySnap(date, supplyId, qty, null);
        } else {
          await State.cascadeSupplySnap(date, supplyId, null, selStatus);
        }
        Dashboard.refreshSupplyGrid();
        Inspection.refreshAll();
        UI.toast('消耗品記錄已儲存並同步後續日期');
      });
    });
  }

  function bindDatePicker() {
    const picker = document.getElementById('history-date-picker');
    if (!picker) return;
    picker.max = Utils.todayStr();
    picker.addEventListener('change', () => {
      if (picker.value) open(picker.value);
    });
  }

  return { open, bindDatePicker };
})();
