/**
 * popup.js — Custom styled alert & confirm popups
 * Drop-in replacements for window.alert() and window.confirm()
 *
 * Usage:
 *   showAlert('Book saved!', 'success');        // types: success, error, warning, info
 *   const ok = await showConfirm('Delete?');    // returns true/false
 */

(function () {
  // Inject popup container once
  if (document.getElementById('popup-container')) return;

  const container = document.createElement('div');
  container.id = 'popup-container';
  document.body.appendChild(container);

  // ── Icons (inline SVG) ──
  const ICONS = {
    success: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>`,
    error:   `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    confirm: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  };

  const TYPE_COLORS = {
    success: { bg: '#f0fdf4', border: 'rgba(22,163,74,0.2)', accent: '#16a34a' },
    error:   { bg: '#fef2f2', border: 'rgba(220,38,38,0.2)', accent: '#dc2626' },
    warning: { bg: '#fffbeb', border: 'rgba(217,119,6,0.2)', accent: '#d97706' },
    info:    { bg: '#eff6ff', border: 'rgba(37,99,235,0.2)', accent: '#2563eb' },
    confirm: { bg: '#fffbeb', border: 'rgba(217,119,6,0.2)', accent: '#d97706' },
  };

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    return overlay;
  }

  function createPopupBox(type, message, buttons) {
    const colors = TYPE_COLORS[type] || TYPE_COLORS.info;
    const icon = ICONS[type] || ICONS.info;

    const box = document.createElement('div');
    box.className = 'popup-box';
    box.innerHTML = `
      <div class="popup-icon-ring" style="background:${colors.bg};border:1px solid ${colors.border}">
        ${icon}
      </div>
      <div class="popup-message">${escHtml(message)}</div>
      <div class="popup-buttons">${buttons}</div>
    `;
    return box;
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function removePopup(overlay) {
    overlay.classList.add('popup-closing');
    const box = overlay.querySelector('.popup-box');
    if (box) box.classList.add('popup-closing');
    setTimeout(() => overlay.remove(), 180);
  }

  /**
   * Show a styled alert popup.
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} type
   * @returns {Promise<void>} resolves when user clicks OK
   */
  window.showAlert = function (message, type = 'info') {
    return new Promise((resolve) => {
      const overlay = createOverlay();
      const colors = TYPE_COLORS[type] || TYPE_COLORS.info;

      const btnStyle = type === 'success'
        ? `background:#16a34a;color:#fff;border-color:#16a34a;`
        : type === 'error'
        ? `background:#dc2626;color:#fff;border-color:#dc2626;`
        : ``;

      const box = createPopupBox(type, message,
        `<button class="btn btn-primary popup-btn-ok" style="${btnStyle}">OK</button>`
      );

      overlay.appendChild(box);
      document.getElementById('popup-container').appendChild(overlay);

      // Force reflow for animation
      overlay.offsetHeight;
      overlay.classList.add('popup-visible');

      const okBtn = box.querySelector('.popup-btn-ok');
      okBtn.focus();

      okBtn.addEventListener('click', () => {
        removePopup(overlay);
        resolve();
      });

      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          removePopup(overlay);
          resolve();
        }
      });

      // Close on Escape or Enter
      function onKey(e) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          document.removeEventListener('keydown', onKey);
          removePopup(overlay);
          resolve();
        }
      }
      document.addEventListener('keydown', onKey);
    });
  };

  /**
   * Show a styled confirm popup.
   * @param {string} message
   * @returns {Promise<boolean>} resolves true if confirmed, false if cancelled
   */
  window.showConfirm = function (message) {
    return new Promise((resolve) => {
      const overlay = createOverlay();
      const box = createPopupBox('confirm', message,
        `<button class="btn btn-outline popup-btn-cancel">Cancel</button>
         <button class="btn btn-danger popup-btn-confirm" style="background:var(--red);color:#fff;border-color:var(--red);">Confirm</button>`
      );

      overlay.appendChild(box);
      document.getElementById('popup-container').appendChild(overlay);

      overlay.offsetHeight;
      overlay.classList.add('popup-visible');

      const confirmBtn = box.querySelector('.popup-btn-confirm');
      const cancelBtn = box.querySelector('.popup-btn-cancel');
      confirmBtn.focus();

      confirmBtn.addEventListener('click', () => {
        removePopup(overlay);
        resolve(true);
      });
      cancelBtn.addEventListener('click', () => {
        removePopup(overlay);
        resolve(false);
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          removePopup(overlay);
          resolve(false);
        }
      });
      function onKey(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onKey);
          removePopup(overlay);
          resolve(false);
        } else if (e.key === 'Enter') {
          document.removeEventListener('keydown', onKey);
          removePopup(overlay);
          resolve(true);
        }
      }
      document.addEventListener('keydown', onKey);
    });
  };
})();
