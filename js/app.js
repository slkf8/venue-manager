// app.js — Main entry point
(async () => {
  const root = document.getElementById('root');

  // ── LOADING ────────────────────────────────────────────────────────────────
  root.innerHTML = `<div class="loader"><div class="loader-spin"></div><div class="loader-text">載入中…</div></div>`;

  try {
    await Storage.init();
    await State.initialize();
  } catch (err) {
    root.innerHTML = `<div class="error-screen"><h2>初始化失敗</h2><p>${err.message}</p></div>`;
    return;
  }

  // ── RENDER PAGE ───────────────────────────────────────────────────────────
  root.innerHTML = _buildPage();

  // ── BIND ALL ──────────────────────────────────────────────────────────────
  Checkin.bindCheckinBtn();
  Inspection.bindAll();
  History.bindDatePicker();
  _bindSectionToggles();
  _bindSettingsItems();

  // ── BUILD PAGE HTML ───────────────────────────────────────────────────────
  function _buildPage() {
    return `
      <!-- TOP: CHECKIN BAR -->
      <div id="checkin-bar">
        ${Checkin.renderCheckinBar()}
      </div>

      <!-- DASHBOARD -->
      <div class="section">
        <div class="section-header">
          <h2 class="section-title">儀表板</h2>
        </div>

        <div class="section-sub-title">🔧 設備</div>
        <div id="equip-grid">${Dashboard.renderEquipmentCards()}</div>

        <div class="section-sub-title" style="margin-top:16px">📦 消耗品</div>
        <div id="supply-grid">${Dashboard.renderSupplyCards()}</div>
      </div>

      <!-- INSPECTION (collapsible) -->
      <div class="section">
        <div class="section-header collapsible" data-target="inspection-body" onclick="App.toggleSection(this)">
          <h2 class="section-title">巡查</h2>
          <span class="section-chevron">▾</span>
        </div>
        <div id="inspection-body">
          <div class="section-sub-title">🔧 設備逐項確認</div>
          <div id="insp-equip-list">${Inspection.renderEquipInspection()}</div>

          <div class="section-sub-title" style="margin-top:16px">📦 消耗品</div>
          <div id="insp-supply-list">${Inspection.renderSupplyInspection()}</div>

          <div class="section-sub-title" style="margin-top:16px">👥 人數記錄</div>
          <div id="headcount-section">${Inspection.renderHeadcount()}</div>
        </div>
      </div>

      <!-- ISSUES -->
      <div class="section">
        <div class="section-header">
          <h2 class="section-title">⚠️ 設備問題追蹤</h2>
        </div>
        <div id="issues-active-list">${Issues.renderActiveIssues()}</div>

        <div class="archive-toggle" id="archive-toggle-issues" onclick="App.toggleArchive(this)">
          過往已完成記錄 ▾
        </div>
        <div id="issues-archived-list" class="collapsed">
          ${Issues.renderArchivedIssues()}
        </div>
      </div>

      <!-- HISTORY -->
      <div class="section">
        <div class="section-header">
          <h2 class="section-title">📅 歷史記錄</h2>
        </div>
        <div class="history-picker-row">
          <label class="sheet-label">選擇日期</label>
          <input type="date" id="history-date-picker" class="date-picker-input">
        </div>
      </div>

      <!-- SETTINGS (collapsible) -->
      <div class="section">
        <div class="section-header collapsible collapsed" data-target="settings-body" onclick="App.toggleSection(this)">
          <h2 class="section-title">⚙️ 設定 / 管理</h2>
          <span class="section-chevron">▾</span>
        </div>
        <div id="settings-body" class="collapsed">
          ${_buildSettingsItems()}
        </div>
      </div>

      <div style="height:60px"></div>
    `;
  }

  function _buildSettingsItems() {
    return `
      <div class="settings-list">
        <div class="settings-item" data-action="equip-manage">
          <span class="settings-icon">🔧</span>
          <span class="settings-label">設備管理</span>
          <span class="settings-arrow">›</span>
        </div>
        <div class="settings-item" data-action="supply-manage">
          <span class="settings-icon">📦</span>
          <span class="settings-label">消耗品管理</span>
          <span class="settings-arrow">›</span>
        </div>
        <div class="settings-item" data-action="headcount-setting">
          <span class="settings-icon">👥</span>
          <span class="settings-label">基準人數設定</span>
          <span class="settings-arrow">›</span>
        </div>
        <div class="settings-item" data-action="export">
          <span class="settings-icon">📤</span>
          <div class="settings-label-group">
            <span class="settings-label">Excel 匯出備份</span>
            <span class="settings-sub">匯出完整資料：設備、消耗品、每日記錄、問題追蹤</span>
          </div>
          <span class="settings-arrow">›</span>
        </div>
        <div class="settings-item" data-action="import">
          <span class="settings-icon">📥</span>
          <div class="settings-label-group">
            <span class="settings-label">Excel 匯入恢復</span>
            <span class="settings-sub">只接受本系統匯出格式，匯入將覆蓋本地全部資料</span>
          </div>
          <span class="settings-arrow">›</span>
        </div>
        <div class="settings-item danger" data-action="clear-all">
          <span class="settings-icon">🗑️</span>
          <div class="settings-label-group">
            <span class="settings-label">清空全部本地資料</span>
            <span class="settings-sub">永久清除本機所有資料，建議先匯出備份</span>
          </div>
          <span class="settings-arrow">›</span>
        </div>
      </div>
    `;
  }

  function _bindSectionToggles() {
    // handled via onclick="App.toggleSection(this)"
  }

  function _bindSettingsItems() {
    document.querySelectorAll('.settings-item[data-action]').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        if (action === 'equip-manage') Settings.openEquipManage();
        else if (action === 'supply-manage') Settings.openSupplyManage();
        else if (action === 'headcount-setting') Settings.openHeadcountSetting();
        else if (action === 'export') Excel.exportAll();
        else if (action === 'import') Excel.triggerImport();
        else if (action === 'clear-all') Settings.confirmClearAll();
      });
    });
  }

  // ── GLOBAL HELPERS ────────────────────────────────────────────────────────
  window.App = {
    toggleSection(headerEl) {
      const targetId = headerEl.dataset.target;
      const body = document.getElementById(targetId);
      if (!body) return;
      const isCollapsed = body.classList.toggle('collapsed');
      headerEl.classList.toggle('collapsed', isCollapsed);
    },
    toggleArchive(btn) {
      const body = document.getElementById('issues-archived-list');
      if (body) body.classList.toggle('collapsed');
      btn.classList.toggle('open');
    },
  };
})();
