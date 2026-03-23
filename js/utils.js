// utils.js — Pure utility helpers, no side effects
const Utils = (() => {

  // ── ID ─────────────────────────────────────────────────────────────────────
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── DATE / TIME STRINGS ───────────────────────────────────────────────────
  function nowISO() {
    return new Date().toISOString();
  }

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // "HH:MM"
  function formatTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // "2026年3月23日（一）"
  const _WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  function formatDateChinese(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const wd = _WEEKDAYS[new Date(y, m - 1, d).getDay()];
    return `${y}年${m}月${d}日（${wd}）`;
  }

  // "3/23"
  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const [, m, d] = dateStr.split('-').map(Number);
    return `${m}/${d}`;
  }

  // "3/23 14:30"
  function formatDateTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  return { genId, nowISO, todayStr, formatTime, formatDateChinese, formatDateShort, formatDateTime };
})();
