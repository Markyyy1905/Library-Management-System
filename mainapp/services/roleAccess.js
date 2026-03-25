/**
 * roleAccess.js — Role-based UI restrictions
 * Include this script AFTER authCheck.js on every page.
 *
 * Roles:
 *   Admin     → full access to everything
 *   Librarian → everything EXCEPT Librarian Management page
 *   Member    → Books tab only (read-only: no Actions column, no Add Book, no Export)
 */
const { ipcRenderer: roleIpc } = require('electron');

const ROLE = { ADMIN: 'Admin', LIBRARIAN: 'Librarian', MEMBER: 'Member' };

// Sidebar nav links each role can see (matched against href attribute)
const SIDEBAR_LINKS = {
  [ROLE.MEMBER]:    ['books.html'],
  [ROLE.LIBRARIAN]: ['index.html', 'books.html', 'members.html', 'borrowing.html', 'reports.html'],
  [ROLE.ADMIN]:     ['index.html', 'books.html', 'members.html', 'borrowing.html', 'librarian-register.html', 'reports.html'],
};

// Pages each role is allowed to visit
const ALLOWED_PAGES = SIDEBAR_LINKS;

/* ── Helpers ──────────────────────────────────────────────── */

function getCurrentPage() {
  const path = window.location.pathname.replace(/\\/g, '/');
  return path.split('/').pop() || '';
}

function getUserRole() {
  return (window.currentUser && window.currentUser.Role) || null;
}

function hide(el) {
  if (el) el.style.display = 'none';
}

/* ── Sidebar ──────────────────────────────────────────────── */

function applySidebarRestrictions(role) {
  const allowed = SIDEBAR_LINKS[role] || [];
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;

  let currentLabel = null;
  const labelHasVisibleChild = new Map();

  for (const child of nav.children) {
    if (child.classList.contains('nav-section-label')) {
      currentLabel = child;
      labelHasVisibleChild.set(currentLabel, false);
    } else if (child.classList.contains('nav-item')) {
      const href = child.getAttribute('href') || '';
      if (allowed.some(a => href.endsWith(a))) {
        if (currentLabel) labelHasVisibleChild.set(currentLabel, true);
      } else {
        hide(child);
      }
    }
  }

  // Hide section labels with no visible children
  for (const [label, visible] of labelHasVisibleChild) {
    if (!visible) hide(label);
  }
}

/* ── Page-level restrictions ─────────────────────────────── */

function enforcePageAccess(role) {
  const page = getCurrentPage();
  if (['login.html', 'register.html', ''].includes(page)) return;

  const allowed = ALLOWED_PAGES[role] || [];
  if (!allowed.some(p => page.endsWith(p))) {
    window.location.href = allowed[0] || 'login.html';
  }
}

/* ── Member restrictions ─────────────────────────────────── */

function applyMemberRestrictions(page) {
  if (page.endsWith('books.html')) {
    // 1. Hide topbar actions (Export + Add Book)
    hide(document.querySelector('.topbar-actions'));

    // 2. Inject a style rule to hide the last column (Actions) in the books table
    const style = document.createElement('style');
    style.textContent = `
      #books-table thead th:last-child,
      #books-table tbody td:last-child {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }
}

/* ── Librarian restrictions ──────────────────────────────── */

function applyLibrarianRestrictions(page) {
  // Sidebar and page redirect already block librarian-register.html
  // No additional in-page restrictions needed
}

/* ── Entry point ─────────────────────────────────────────── */

async function applyRoleRestrictions() {
  // Wait for authCheck.js to populate window.currentUser
  let attempts = 0;
  while (!window.currentUser && attempts < 20) {
    await new Promise(r => setTimeout(r, 50));
    attempts++;
  }

  // Fallback: fetch session directly
  if (!window.currentUser) {
    try {
      window.currentUser = await roleIpc.invoke('auth:session');
    } catch (_) {}
  }

  const role = getUserRole();
  if (!role) return; // Not logged in — authCheck handles redirect

  enforcePageAccess(role);
  applySidebarRestrictions(role);

  const page = getCurrentPage();
  if (role === ROLE.MEMBER)    applyMemberRestrictions(page);
  if (role === ROLE.LIBRARIAN) applyLibrarianRestrictions(page);
  // Admin → no restrictions
}

applyRoleRestrictions();
