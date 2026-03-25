const { ipcRenderer } = require('electron');

async function initAuth() {
  // Skip auth check on login/register pages
  if (['/login.html', '/register.html'].some(p => window.location.pathname.endsWith(p))) {
    return;
  }

  try {
    const session = await ipcRenderer.invoke('auth:session');
    if (!session) {
      window.location.href = 'login.html';
      return;
    }
    window.currentUser = session;
  } catch (err) {
    console.error('Auth check failed:', err);
    window.location.href = 'login.html';
  }
}

// Run on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}
