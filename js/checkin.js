// checkin.js — Top bar checkin button logic
const Checkin = (() => {

  function renderCheckinBar() {
    const { todayRecord, today } = State.data;
    const done = todayRecord && todayRecord.checkinDone;
    const timeStr = done && todayRecord.checkinTime
      ? Utils.formatTime(todayRecord.checkinTime)
      : '';
    return `
      <div class="checkin-bar">
        <div class="checkin-date">${Utils.formatDateChinese(today)}</div>
        <button class="btn ${done ? 'btn-confirmed' : 'btn-checkin'}" id="checkin-btn" ${done ? 'disabled' : ''}>
          ${done ? `已確認 ${timeStr}` : '今日確認 / 打卡'}
        </button>
      </div>
    `;
  }

  function refreshCheckinBar() {
    const el = document.getElementById('checkin-bar');
    if (el) el.innerHTML = renderCheckinBar();
    bindCheckinBtn();
  }

  function bindCheckinBtn() {
    const btn = document.getElementById('checkin-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      await State.doCheckin();
      // replace whole bar
      const bar = document.getElementById('checkin-bar');
      if (bar) {
        const { todayRecord } = State.data;
        const timeStr = todayRecord.checkinTime ? Utils.formatTime(todayRecord.checkinTime) : '';
        btn.textContent = `已確認 ${timeStr}`;
        btn.className = 'btn btn-confirmed';
        btn.disabled = true;
      }
      UI.toast('✅ 今日已確認打卡');
    });
  }

  return { renderCheckinBar, refreshCheckinBar, bindCheckinBtn };
})();
