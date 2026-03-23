// ui.js — Sheet overlay, toast, dialog, section toggle helpers
const UI = (() => {
  let _sheetStack = [];

  // ── TOAST ──────────────────────────────────────────────────────────────────
  function toast(msg, type = 'info', duration = 2200) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // ── BOTTOM SHEET ───────────────────────────────────────────────────────────
  function openSheet(id, contentHTML, opts = {}) {
    // opts: { title, onClose, tall }
    let overlay = document.getElementById('sheet-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sheet-overlay';
      overlay.className = 'sheet-overlay';
      document.body.appendChild(overlay);
    }
    overlay.classList.add('active');

    let sheet = document.getElementById(id);
    if (sheet) sheet.remove();

    sheet = document.createElement('div');
    sheet.id = id;
    sheet.className = 'bottom-sheet' + (opts.tall ? ' tall' : '');
    sheet.innerHTML = `
      <div class="sheet-header">
        <div class="sheet-handle"></div>
        <div class="sheet-header-row">
          ${opts.title ? `<div class="sheet-title">${opts.title}</div>` : '<div></div>'}
          <button class="sheet-close-btn" onclick="UI.closeSheet('${id}')" aria-label="關閉">✕</button>
        </div>
      </div>
      <div class="sheet-body">${contentHTML}</div>
    `;
    document.body.appendChild(sheet);
    _sheetStack.push({ id, onClose: opts.onClose });

    requestAnimationFrame(() => {
      overlay.classList.add('active');
      sheet.classList.add('open');
    });

    overlay.onclick = () => closeSheet(id);
  }

  function closeSheet(id) {
    const sheet = document.getElementById(id);
    const overlay = document.getElementById('sheet-overlay');
    if (sheet) {
      sheet.classList.remove('open');
      sheet.addEventListener('transitionend', () => sheet.remove(), { once: true });
    }
    const idx = _sheetStack.findIndex(s => s.id === id);
    if (idx !== -1) {
      const { onClose } = _sheetStack[idx];
      _sheetStack.splice(idx, 1);
      if (typeof onClose === 'function') onClose();
    }
    if (_sheetStack.length === 0 && overlay) {
      overlay.classList.remove('active');
      overlay.onclick = null;
    }
  }

  function closeAllSheets() {
    [..._sheetStack].reverse().forEach(s => closeSheet(s.id));
  }

  function updateSheetBody(id, html) {
    const sheet = document.getElementById(id);
    if (sheet) {
      const body = sheet.querySelector('.sheet-body');
      if (body) body.innerHTML = html;
    }
  }

  // ── CONFIRM DIALOG ─────────────────────────────────────────────────────────
  function confirm(opts) {
    // opts: { title, message, confirmText, cancelText, danger, onConfirm, onCancel }
    return new Promise(resolve => {
      const id = 'dlg-' + Utils.genId();
      const html = `
        <div class="dialog-backdrop" id="${id}">
          <div class="dialog ${opts.danger ? 'danger' : ''}">
            ${opts.title ? `<div class="dialog-title">${opts.title}</div>` : ''}
            ${opts.message ? `<div class="dialog-msg">${opts.message}</div>` : ''}
            <div class="dialog-actions">
              <button class="btn btn-ghost dialog-cancel">${opts.cancelText || '取消'}</button>
              <button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'} dialog-confirm">${opts.confirmText || '確認'}</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      const el = document.getElementById(id);
      requestAnimationFrame(() => el.classList.add('show'));

      const cleanup = (result) => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 250);
        resolve(result);
        if (result && typeof opts.onConfirm === 'function') opts.onConfirm();
        if (!result && typeof opts.onCancel === 'function') opts.onCancel();
      };

      el.querySelector('.dialog-confirm').onclick = () => cleanup(true);
      el.querySelector('.dialog-cancel').onclick = () => cleanup(false);
      el.addEventListener('click', e => { if (e.target === el) cleanup(false); });
    });
  }

  // ── SECTION TOGGLE ─────────────────────────────────────────────────────────
  function initSectionToggles() {
    document.querySelectorAll('.section-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const open = target.classList.toggle('collapsed');
        btn.classList.toggle('collapsed', !open);
      });
    });
  }

  function toggleSection(btnEl) {
    const target = document.getElementById(btnEl.dataset.target);
    if (!target) return;
    const isCollapsed = target.classList.toggle('collapsed');
    btnEl.classList.toggle('collapsed', isCollapsed);
  }

  // ── SEGMENTED CONTROL ──────────────────────────────────────────────────────
  function renderSegmented(options, selected, onChange) {
    const items = options.map(o =>
      `<button class="seg-item${o.value === selected ? ' active' : ''}" data-value="${o.value}">${o.label}</button>`
    ).join('');
    const html = `<div class="segmented-control">${items}</div>`;

    // attach after insertion
    setTimeout(() => {
      document.querySelectorAll('.segmented-control').forEach(ctrl => {
        if (ctrl.dataset.bound) return;
        ctrl.dataset.bound = '1';
        ctrl.addEventListener('click', e => {
          const btn = e.target.closest('.seg-item');
          if (!btn) return;
          ctrl.querySelectorAll('.seg-item').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (typeof onChange === 'function') onChange(btn.dataset.value);
        });
      });
    }, 0);
    return html;
  }

  // ── STEPPER ────────────────────────────────────────────────────────────────
  function renderStepper(id, value, min = 0, max = 9999) {
    return `
      <div class="stepper" id="stepper-${id}">
        <button class="stepper-btn" data-action="dec" data-id="${id}">−</button>
        <span class="stepper-val" id="stepper-val-${id}">${value}</span>
        <button class="stepper-btn" data-action="inc" data-id="${id}">+</button>
      </div>`;
  }

  function initStepper(id, value, min, max, onChange) {
    const el = document.getElementById(`stepper-${id}`);
    if (!el) return;
    let v = value;
    el.querySelectorAll('.stepper-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'inc') v = Math.min(max, v + 1);
        else v = Math.max(min, v - 1);
        document.getElementById(`stepper-val-${id}`).textContent = v;
        if (typeof onChange === 'function') onChange(v);
      });
    });
  }

  return {
    toast, openSheet, closeSheet, closeAllSheets, updateSheetBody,
    confirm, initSectionToggles, toggleSection,
    renderSegmented, renderStepper, initStepper,
  };
})();
