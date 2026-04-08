// history.js — Date picker + history bottom sheet
const History = (() => {

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setBusyState(target, isBusy, options = {}) {
    if (!target && !options.buttons && !options.controls) return;

    const {
      busyText = '儲存中...',
      idleText = '',
      disableTarget = true,
      buttons = null,
      controls = null,
    } = options;

    if (buttons && Array.isArray(buttons)) {
      buttons.forEach(btn => {
        if (!btn) return;
        btn.disabled = !!isBusy;
      });
    }

    if (controls && Array.isArray(controls)) {
      controls.forEach(control => {
        if (!control) return;
        control.disabled = !!isBusy;
      });
    }

    if (disableTarget && target) target.disabled = !!isBusy;

    if (target && target.tagName === 'BUTTON') {
      if (isBusy) {
        if (!target.dataset.idleText) target.dataset.idleText = target.textContent;
        target.textContent = busyText;
      } else {
        target.textContent = target.dataset.idleText || idleText || target.textContent;
        delete target.dataset.idleText;
      }
    }
  }

  async function open(dateStr) {
    if (!dateStr) return;
    const sheetId = 'sheet-history';
    UI.openSheet(sheetId, '<div class="loading-hint">載入中…</div>', { title: `歷史記錄：${Utils.formatDateShort(dateStr)}`, tall: true });
    const content = await _buildHistoryContent(dateStr);
    UI.updateSheetBody(sheetId, content);
    _bindHistoryEvents(sheetId, dateStr);
  }

  async function _refreshOpenSheet(dateStr) {
    if (!dateStr) return;
    const sheetId = 'sheet-history';
    const sheet = document.getElementById(sheetId);
    const body = sheet ? sheet.querySelector('.sheet-body') : null;
    const prevScrollTop = body ? body.scrollTop : 0;

    const content = await _buildHistoryContent(dateStr);
    UI.updateSheetBody(sheetId, content);
    _bindHistoryEvents(sheetId, dateStr);

    const updatedBody = document.getElementById(sheetId)?.querySelector('.sheet-body');
    if (updatedBody) updatedBody.scrollTop = prevScrollTop;
  }

  // ── BUILD CONTENT ─────────────────────────────────────────────────────────
  async function _buildHistoryContent(date) {
    const record = await Storage.getAllByIndex(Storage.S.DAILY, 'date', date);
    const rec = record[0] || null;
    const allIssues = await Storage.getAll(Storage.S.ISSUES);
    const logs = (await Storage.getAllByIndex(Storage.S.LOGS, 'date', date))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const equipment = State.data.equipment;
    const supplies = State.data.supplies;

    const eSnapMap = await _buildEffectiveEquipSnapMap(date, equipment);
    const sSnapMap = await _buildEffectiveSupplySnapMap(date, supplies);

    return `
      <!-- 打卡 -->
      <div class="hist-section">
        <div class="hist-section-title">📋 打卡</div>
        <div class="hist-checkin"
          data-original-checkin-done="${rec && rec.checkinDone ? 'true' : 'false'}"
          data-original-checkin-time="${rec && rec.checkinTime ? rec.checkinTime : ''}"
        >
          <label class="hist-field-label">打卡狀態</label>
          <div class="seg-wrap">
            <button class="seg-pill${rec && rec.checkinDone ? ' active' : ''}" data-hist-checkin="true">已打卡</button>
            <button class="seg-pill${!(rec && rec.checkinDone) ? ' active' : ''}" data-hist-checkin="false">未打卡</button>
          </div>
          ${rec && rec.checkinDone
            ? `<div class="hist-meta">打卡時間：${rec.checkinTime ? Utils.formatDateTime(rec.checkinTime) : '未記錄'}</div>`
            : ''}
        </div>
      </div>

      <!-- 人數 -->
      <div class="hist-section">
        <div class="hist-section-title">👥 人數</div>
        <div class="headcount-grid">
          <div class="hc-cell">
            <div class="hc-label">應到</div>
            <input class="hc-input" type="number" id="hist-expected" value="${rec ? rec.headcountExpected : State.data.settings.globalHeadcountBase}" min="0">
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
        <input class="hc-note-input" type="text" id="hist-hc-note" placeholder="備註" value="${escapeHtml(rec ? (rec.headcountNote || '') : '')}">
        <button class="btn btn-primary btn-sm hist-hc-save" data-date="${date}">儲存人數</button>
      </div>

      <!-- 設備 -->
      <div class="hist-section">
        <div class="hist-section-title">🔧 設備</div>
        ${equipment.filter(e => eSnapMap[e.id]).map(e => {
          const snap = eSnapMap[e.id];
          return `
            <div class="hist-equip-item" data-equip-id="${e.id}" data-date="${date}">
              <div class="hist-item-name">${escapeHtml(e.name)}${!e.isActive ? '（已停用）' : ''}</div>
              ${snap.date !== date ? `<div class="hist-meta">沿用自：${Utils.formatDateShort(snap.date)}</div>` : ''}
              <div class="seg-wrap small">
                ${['正常','待處理','處理中','已處理'].map(s => `
                  <button class="seg-pill${snap.status === s ? ' active' : ''}" data-hist-equip-status="${s}">${s}</button>
                `).join('')}
              </div>
              <input class="hist-note-input" type="text" placeholder="備註" value="${escapeHtml(snap.note || '')}">
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
                <div class="hist-item-name">${escapeHtml(s.name)}（${escapeHtml(s.unit)}）${!s.isActive ? '（已停用）' : ''}</div>
                ${snap.date !== date ? `<div class="hist-meta">沿用自：${Utils.formatDateShort(snap.date)}</div>` : ''}
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
                <div class="hist-item-name">${escapeHtml(s.name)}${!s.isActive ? '（已停用）' : ''}</div>
                ${snap.date !== date ? `<div class="hist-meta">沿用自：${Utils.formatDateShort(snap.date)}</div>` : ''}
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
          ? logs.map(l => {
              const isHistoryFix = (l.message || '').startsWith('歷史修正：');
              const displayMessage = isHistoryFix
                ? l.message.replace(/^歷史修正：/, '')
                : l.message;
              return `<div class="log-item">
                <span class="log-time">${Utils.formatDateTime(l.createdAt)}</span>
                ${isHistoryFix ? '<span class="hist-meta">【歷史修正】</span> ' : ''}
                ${escapeHtml(displayMessage)}
              </div>`;
            }).join('')
          : '<p class="empty-hint">無操作記錄</p>'
        }
      </div>
    `;
  }

  async function _buildEffectiveEquipSnapMap(date, equipment) {
    const allESnaps = await Storage.getAll(Storage.S.ESNAP);
    const map = {};

    for (const equip of equipment) {
      const related = allESnaps.filter(s => s.equipmentId === equip.id && s.date <= date);
      if (!related.length) continue;

      const exact = related.find(s => s.date === date);
      if (exact) {
        map[equip.id] = exact;
        continue;
      }

      const latestBefore = related
        .filter(s => s.date < date)
        .sort((a, b) => b.date.localeCompare(a.date))[0];

      if (latestBefore) {
        map[equip.id] = latestBefore;
      }
    }

    return map;
  }

  async function _buildEffectiveSupplySnapMap(date, supplies) {
    const allSSnaps = await Storage.getAll(Storage.S.SSNAP);
    const map = {};

    for (const supply of supplies) {
      const related = allSSnaps.filter(s => s.supplyId === supply.id && s.date <= date);
      if (!related.length) continue;

      const exact = related.find(s => s.date === date);
      if (exact) {
        map[supply.id] = exact;
        continue;
      }

      const latestBefore = related
        .filter(s => s.date < date)
        .sort((a, b) => b.date.localeCompare(a.date))[0];

      if (latestBefore) {
        map[supply.id] = latestBefore;
      }
    }

    return map;
  }

  function _renderHistIssues(allIssues, date, equipment) {
    function getRelevantEventTime(issue) {
      const candidates = [];
      if (issue.createdAt && issue.createdAt.slice(0, 10) === date) candidates.push(issue.createdAt);
      if (issue.completedAt && issue.completedAt.slice(0, 10) === date) candidates.push(issue.completedAt);
      if (issue.normalizedAt && issue.normalizedAt.slice(0, 10) === date) candidates.push(issue.normalizedAt);
      return candidates.sort((a, b) => b.localeCompare(a))[0] || '';
    }

    const relevant = allIssues
      .filter(i => {
        const created = i.createdAt ? i.createdAt.slice(0, 10) : '';
        const completed = i.completedAt ? i.completedAt.slice(0, 10) : '';
        const normalized = i.normalizedAt ? i.normalizedAt.slice(0, 10) : '';
        return created === date || completed === date || normalized === date;
      })
      .sort((a, b) => getRelevantEventTime(b).localeCompare(getRelevantEventTime(a)));
    if (!relevant.length) return '<p class="empty-hint">當天無設備問題記錄</p>';
    return relevant.map(i => {
      const e = equipment.find(x => x.id === i.equipmentId);
      const name = e ? `${escapeHtml(e.name)}${!e.isActive ? '（已停用）' : ''}` : escapeHtml(i.equipmentId);

      const created = i.createdAt ? i.createdAt.slice(0, 10) : '';
      const completed = i.completedAt ? i.completedAt.slice(0, 10) : '';
      const normalized = i.normalizedAt ? i.normalizedAt.slice(0, 10) : '';

      const eventTags = [];
      if (created === date) eventTags.push('當天建立');
      if (completed === date) eventTags.push('當天完成');
      if (normalized === date) eventTags.push('當天恢復正常');

      return `<div class="hist-issue-item">
        <strong>${name}</strong>${eventTags.length ? ' — ' + eventTags.join(' · ') : ''}
        <br><span class="hist-meta">目前狀態：${i.status}</span>
        ${i.note ? `<br><span class="hist-meta">目前備註：${escapeHtml(i.note)}</span>` : ''}
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
      function updateMissingDisplay() {
        const parsedExpected = parseInt(histExpected.value, 10);
        const exp = Number.isNaN(parsedExpected) ? 0 : Math.max(0, parsedExpected);
        const parsedActual = parseInt(histActual.value, 10);
        const act = Number.isNaN(parsedActual) ? null : Math.max(0, parsedActual);
        histMissing.textContent = act === null ? '—' : Math.max(0, exp - act);
      }

      histActual.addEventListener('input', updateMissingDisplay);
      histExpected.addEventListener('input', updateMissingDisplay);
    }

    // Save headcount
    const originalExpected = histExpected ? (histExpected.value === '' ? null : parseInt(histExpected.value)) : null;
    const originalActual = histActual ? (histActual.value === '' ? null : parseInt(histActual.value)) : null;
    const originalHcNote = sheet.querySelector('#hist-hc-note') ? sheet.querySelector('#hist-hc-note').value.trim() : '';

    sheet.querySelector('.hist-hc-save')?.addEventListener('click', async () => {
      const saveBtn = sheet.querySelector('.hist-hc-save');
      const hcControls = [
        sheet.querySelector('#hist-expected'),
        sheet.querySelector('#hist-actual'),
        sheet.querySelector('#hist-hc-note'),
      ];
      if (saveBtn?.dataset.saving === 'true') return;
      if (saveBtn) saveBtn.dataset.saving = 'true';
      setBusyState(saveBtn, true, { busyText: '儲存中...', controls: hcControls });
      try {
        const rawExpected = sheet.querySelector('#hist-expected').value;
        const parsedExpected = parseInt(rawExpected, 10);
        const exp = Number.isNaN(parsedExpected) ? 0 : Math.max(0, parsedExpected);
        const actVal = sheet.querySelector('#hist-actual').value.trim();
        const parsedActual = parseInt(actVal, 10);
        const act = actVal === '' ? null : (Number.isNaN(parsedActual) ? null : Math.max(0, parsedActual));
        const note = sheet.querySelector('#hist-hc-note').value.trim();

        if (originalExpected === exp && originalActual === act && originalHcNote === note) {
          UI.toast('沒有變更');
          return;
        }

        const rec = await State.ensureDailyRecordAtDate(date);
        rec.headcountExpected = exp;
        rec.headcountActual = act;
        rec.headcountMissing = act !== null ? Math.max(0, exp - act) : null;
        rec.headcountNote = note;

        await Storage.put(Storage.S.DAILY, rec);
        if (date === State.data.today) await State.reloadLists();

        let hcLog = `歷史修正：人數 應到 ${originalExpected ?? '未記錄'}→${exp}，實到 ${originalActual ?? '未記錄'}→${act ?? '未記錄'}`;
        if (originalHcNote !== note) hcLog += `，備註「${originalHcNote || '空'}」→「${note || '空'}」`;
        await State.addLogAtDate(date, hcLog);
        await _refreshOpenSheet(date);
        UI.toast('人數已儲存');
      } finally {
        if (saveBtn) delete saveBtn.dataset.saving;
        setBusyState(saveBtn, false, { controls: hcControls });
      }
    });

    // Checkin toggle
    const histCheckinBox = sheet.querySelector('.hist-checkin');
    const originalDone = histCheckinBox?.dataset.originalCheckinDone === 'true';
    const originalTime = histCheckinBox?.dataset.originalCheckinTime || null;

    sheet.querySelectorAll('[data-hist-checkin]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const checkinButtons = Array.from(sheet.querySelectorAll('[data-hist-checkin]'));
        if (histCheckinBox?.dataset.saving === 'true') return;
        if (histCheckinBox) histCheckinBox.dataset.saving = 'true';
        setBusyState(null, true, { buttons: checkinButtons });
        try {
          const done = btn.dataset.histCheckin === 'true';
          sheet.querySelectorAll('[data-hist-checkin]').forEach(b => b.classList.toggle('active', b === btn));

          let newCheckinTime = originalTime;
          if (done && date === State.data.today && !newCheckinTime) newCheckinTime = Utils.nowISO();
          if (!done) newCheckinTime = null;

          if (originalDone === done && originalTime === newCheckinTime) {
            UI.toast('沒有變更');
            return;
          }

          const rec = await State.ensureDailyRecordAtDate(date);
          rec.checkinDone = done;
          rec.checkinTime = newCheckinTime;

          await Storage.put(Storage.S.DAILY, rec);

          if (date === State.data.today) {
            State.data.todayRecord = rec;
            Checkin.refreshCheckinBar();
          }

          let checkinLog = `歷史修正：打卡狀態 ${originalDone ? '已打卡' : '未打卡'}→${done ? '已打卡' : '未打卡'}`;
          if (originalTime !== newCheckinTime) checkinLog += `，時間 ${originalTime ? Utils.formatDateTime(originalTime) : '未記錄'}→${newCheckinTime ? Utils.formatDateTime(newCheckinTime) : '未記錄'}`;
          await State.addLogAtDate(date, checkinLog);
          await _refreshOpenSheet(date);
          UI.toast('打卡狀態已更新');
        } finally {
          if (histCheckinBox) delete histCheckinBox.dataset.saving;
          setBusyState(null, false, { buttons: checkinButtons });
        }
      });
    });

    // Equipment status + save
    sheet.querySelectorAll('.hist-equip-item').forEach(item => {
      const equipId = item.dataset.equipId;
      let selStatus = item.querySelector('.seg-pill.active')?.dataset.histEquipStatus || '正常';
      const originalStatus = selStatus;
      const originalNote = item.querySelector('.hist-note-input').value.trim();

      item.querySelectorAll('[data-hist-equip-status]').forEach(pill => {
        pill.addEventListener('click', () => {
          selStatus = pill.dataset.histEquipStatus;
          item.querySelectorAll('[data-hist-equip-status]').forEach(p => p.classList.toggle('active', p === pill));
        });
      });

      item.querySelector('.hist-equip-save')?.addEventListener('click', async () => {
        const saveBtn = item.querySelector('.hist-equip-save');
        const equipControls = [
          ...item.querySelectorAll('[data-hist-equip-status]'),
          item.querySelector('.hist-note-input'),
        ];
        if (item.dataset.saving === 'true') return;
        item.dataset.saving = 'true';
        setBusyState(saveBtn, true, { busyText: '儲存中...', controls: equipControls });
        try {
          const note = item.querySelector('.hist-note-input').value.trim();
          if (selStatus === originalStatus && note === originalNote) {
            UI.toast('沒有變更');
            return;
          }
          await State.upsertEquipSnapAtDate(date, equipId, selStatus, note);
          const equipName = State.data.equipment.find(e => e.id === equipId)?.name || equipId;
          let equipLog = `歷史修正：設備「${equipName}」 ${originalStatus}→${selStatus}`;
          if (originalNote !== note) equipLog += `，備註「${originalNote || '空'}」→「${note || '空'}」`;
          await State.addLogAtDate(date, equipLog);
          if (date === State.data.today) {
            Dashboard.refreshEquipmentGrid();
            Inspection.refreshAll();
          }
          await _refreshOpenSheet(date);
          UI.toast('設備記錄已儲存');
        } finally {
          delete item.dataset.saving;
          setBusyState(saveBtn, false, { controls: equipControls });
        }
      });
    });

    // Supply stepper + save
    sheet.querySelectorAll('.hist-supply-item').forEach(item => {
      const supplyId = item.dataset.supplyId;
      const type = item.dataset.type;
      let selStatus = item.querySelector('.seg-pill.active')?.dataset.histSupplyStatus || '正常';
      let qty = parseInt(item.querySelector('.stepper-val')?.textContent) || 0;
      const originalQty = qty;
      const originalStatus = selStatus;

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
        const saveBtn = item.querySelector('.hist-supply-save');
        const supplyControls = type === 'quantity'
          ? [...item.querySelectorAll('.stepper-btn')]
          : [...item.querySelectorAll('[data-hist-supply-status]')];
        if (item.dataset.saving === 'true') return;
        item.dataset.saving = 'true';
        setBusyState(saveBtn, true, { busyText: '儲存中...', controls: supplyControls });
        try {
          if (type === 'quantity' && qty === originalQty) {
            UI.toast('沒有變更');
            return;
          }
          if (type !== 'quantity' && selStatus === originalStatus) {
            UI.toast('沒有變更');
            return;
          }
          if (type === 'quantity') {
            await State.upsertSupplySnapAtDate(date, supplyId, qty, null);
          } else {
            await State.upsertSupplySnapAtDate(date, supplyId, null, selStatus);
          }
          const supplyName = State.data.supplies.find(s => s.id === supplyId)?.name || supplyId;
          if (type === 'quantity') {
            await State.addLogAtDate(date, `歷史修正：消耗品「${supplyName}」 數量 ${originalQty}→${qty}`);
          } else {
            await State.addLogAtDate(date, `歷史修正：消耗品「${supplyName}」 狀態 ${originalStatus}→${selStatus}`);
          }
          if (date === State.data.today) {
            Dashboard.refreshSupplyGrid();
            Inspection.refreshAll();
          }
          await _refreshOpenSheet(date);
          UI.toast('消耗品記錄已儲存');
        } finally {
          delete item.dataset.saving;
          setBusyState(saveBtn, false, { controls: supplyControls });
        }
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
