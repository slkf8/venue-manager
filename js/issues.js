// issues.js — Equipment issue tracking
const Issues = (() => {

  // ── HELPERS ────────────────────────────────────────────────────────────────
  function _equipName(id) {
    const e = State.data.equipment.find(x => x.id === id);
    return e ? e.name : id;
  }

  function _statusClass(s) {
    return s === '待處理' ? 'cs-warn' : s === '處理中' ? 'cs-process' : 'cs-normal';
  }

  // ── ENSURE ISSUE EXISTS ───────────────────────────────────────────────────
  async function ensureIssue(equipId, status) {
    // Only create if no active (non-archived) issue for this equipment
    const existing = State.data.activeIssues.find(i => i.equipmentId === equipId);
    if (!existing) {
      await State.addIssue(equipId, status, '');
    } else if (existing.status !== status) {
      await State.updateIssue(existing.id, status, existing.note);
    }
    refreshIssuesList();
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  function renderActiveIssues() {
    const list = State.data.activeIssues;
    if (!list.length) return '<p class="empty-hint">目前沒有待處理問題 👍</p>';
    return list.map(issue => `
      <div class="issue-item" onclick="Issues.openIssueSheet('${issue.id}')">
        <div class="issue-name">${_equipName(issue.equipmentId)}</div>
        <span class="status-badge ${_statusClass(issue.status)}">${issue.status}</span>
      </div>
    `).join('');
  }

  function renderArchivedIssues() {
    const list = State.data.archivedIssues;
    if (!list.length) return '<p class="empty-hint">尚無已完成的問題記錄</p>';
    return [...list].sort((a, b) => (b.normalizedAt || b.completedAt || '') > (a.normalizedAt || a.completedAt || '') ? 1 : -1)
      .map(issue => `
        <div class="issue-item archived">
          <div class="issue-name">${_equipName(issue.equipmentId)}</div>
          <div class="issue-meta">
            <span class="status-badge cs-normal">已完成</span>
            ${issue.normalizedAt ? `<span class="issue-time">恢復 ${Utils.formatDateTime(issue.normalizedAt)}</span>` : ''}
          </div>
        </div>
      `).join('');
  }

  function refreshIssuesList() {
    const activeEl = document.getElementById('issues-active-list');
    if (activeEl) activeEl.innerHTML = renderActiveIssues();
    const archEl = document.getElementById('issues-archived-list');
    if (archEl) archEl.innerHTML = renderArchivedIssues();
  }

  // ── ISSUE DETAIL SHEET ────────────────────────────────────────────────────
  function openIssueSheet(issueId) {
    const issue = State.data.activeIssues.find(i => i.id === issueId)
      || State.data.archivedIssues.find(i => i.id === issueId);
    if (!issue) return;
    const sheetId = 'sheet-issue-detail';
    const name = _equipName(issue.equipmentId);
    const statuses = ['待處理', '處理中', '已處理'];
    let selStatus = issue.status;
    let noteVal = issue.note || '';

    const renderBody = () => `
      <div class="sheet-field-group">
        <div class="sheet-label">問題狀態</div>
        <div class="seg-wrap">
          ${statuses.map(s => `
            <button class="seg-pill${s === selStatus ? ' active' : ''}" data-status="${s}">${s}</button>
          `).join('')}
        </div>
      </div>
      <div class="sheet-field-group">
        <div class="sheet-label">備註</div>
        <textarea class="sheet-textarea" id="issue-note-input" rows="3" placeholder="可留空">${noteVal}</textarea>
      </div>
      <div class="issue-timestamps">
        <div>建立：${Utils.formatDateTime(issue.createdAt)}</div>
        ${issue.completedAt ? `<div>完成：${Utils.formatDateTime(issue.completedAt)}</div>` : ''}
        ${issue.normalizedAt ? `<div>恢復正常：${Utils.formatDateTime(issue.normalizedAt)}</div>` : ''}
      </div>
      <button class="btn btn-primary btn-block" id="issue-save-btn">儲存</button>
      ${selStatus === '已處理' && !issue.isArchived ? `<button class="btn btn-success btn-block" id="issue-resolve-btn">✅ 確認恢復正常</button>` : ''}
    `;

    UI.openSheet(sheetId, renderBody(), { title: name });
    const sheet = document.getElementById(sheetId);

    sheet.addEventListener('click', async e => {
      const pill = e.target.closest('[data-status]');
      if (pill) {
        selStatus = pill.dataset.status;
        sheet.querySelectorAll('.seg-pill').forEach(p => p.classList.toggle('active', p.dataset.status === selStatus));
        // show/hide resolve button
        const resolveBtn = sheet.querySelector('#issue-resolve-btn');
        if (selStatus === '已處理' && !issue.isArchived) {
          if (!resolveBtn) {
            const saveBtn = sheet.querySelector('#issue-save-btn');
            const rb = document.createElement('button');
            rb.className = 'btn btn-success btn-block';
            rb.id = 'issue-resolve-btn';
            rb.textContent = '✅ 確認恢復正常';
            saveBtn.after(rb);
          }
        } else if (resolveBtn) {
          resolveBtn.remove();
        }
      }

      if (e.target.id === 'issue-save-btn') {
        noteVal = sheet.querySelector('#issue-note-input').value.trim();
        await State.updateIssue(issueId, selStatus, noteVal);
        // sync equipment status (selStatus is always one of 待處理/處理中/已處理)
        await State.updateEquipStatus(issue.equipmentId, selStatus, null);
        refreshIssuesList();
        Dashboard.refreshEquipmentGrid();
        Inspection.refreshAll();
        UI.closeSheet(sheetId);
        UI.toast('已儲存');
      }

      if (e.target.id === 'issue-resolve-btn') {
        await _resolveFlow(issueId, sheetId);
      }
    });
  }

  async function _resolveFlow(issueId, sheetId) {
    const ok = await UI.confirm({
      title: '確認恢復正常',
      message: '確定此問題已恢復正常？它將移入過往記錄。',
      confirmText: '確認恢復',
    });
    if (!ok) return;
    const issue = State.data.activeIssues.find(i => i.id === issueId);
    if (issue) {
      await State.resolveIssue(issueId);
      await State.updateEquipStatus(issue.equipmentId, '正常', null);
    }
    refreshIssuesList();
    Dashboard.refreshEquipmentGrid();
    Inspection.refreshAll();
    UI.closeSheet(sheetId);
    UI.toast('已記錄恢復正常');
  }

  // ── RESOLVE BY EQUIPMENT ID ───────────────────────────────────────────────
  // Finds any active issue for the equipment and archives it.
  // Callers are responsible for updating the equipment status separately.
  async function resolveByEquip(equipId) {
    const issue = State.data.activeIssues.find(i => i.equipmentId === equipId);
    if (!issue) return;
    await State.resolveIssue(issue.id);
    refreshIssuesList();
  }

  return { ensureIssue, resolveByEquip, renderActiveIssues, renderArchivedIssues, refreshIssuesList, openIssueSheet };
})();
