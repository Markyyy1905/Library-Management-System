# IMPORTANT

To setup the app for each desktop, run these at your IDE Terminal.

Install Electron: Install Electron as a development dependency.

- npm install electron --save-dev

Install ODBC: Install odbc for access connection.

- npm install odbc

---

## Role-Based Access Control

The app supports three user roles with different access levels:

| Feature | Member | Librarian | Admin |
|---|---|---|---|
| Books (read-only catalog) | ✅ | ✅ | ✅ |
| Books (add / edit / delete / export) | ❌ | ✅ | ✅ |
| Dashboard | ❌ | ✅ | ✅ |
| Members | ❌ | ✅ | ✅ |
| Borrowing | ❌ | ✅ | ✅ |
| Reports | ❌ | ✅ | ✅ |
| Librarian Management | ❌ | ❌ | ✅ |

- **Member** — Can only view the book catalog. The Actions column, Add Book button, and Export button are hidden and disabled.
- **Librarian** — Full access to all features except Librarian Account Management.
- **Admin** — Unrestricted access to everything.

Role restrictions are enforced client-side via `mainapp/services/roleAccess.js`. Sidebar navigation items and section labels are dynamically hidden based on the logged-in user's role. Unauthorized page access triggers a redirect to the user's first allowed page.

---

## Restore main.js

> **Note:** Cloning this repo may overwrite `main.js`. After installing Electron, replace the contents of `main.js` with the code below:

```js
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Import services
const db       = require('./mainapp/services/db');
const Auth     = require('./mainapp/services/auth');
const Books    = require('./mainapp/services/books');
const Members  = require('./mainapp/services/members');
const Borrowing = require('./mainapp/services/borrowing');
const { Authors, Categories, Users, Roles, AuditLogs } = require('./mainapp/services/lookup');

// ── Simple in-process session store ──────────────────────────
// Stores { UserID, Username, RoleID, RoleName, ... } after successful login.
let currentSession = null;

// ── In-memory books cache (warmed after login) ──────────────
let booksCache = null;
let booksCategoriesCache = null;

const ROLE_IDS = {
  ADMIN: 1,
  LIBRARIAN: 2,
  MEMBER: 3,
};

const DB_FILE_PATH = path.join(__dirname, 'mainapp', 'data', 'LMS.accdb');
const BACKUP_DIR = path.join(__dirname, 'backups');
const AUTO_BACKUP_FILE = 'LMS-auto-backup.accdb';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every hour.

let autoBackupTimer = null;
let autoBackupInProgress = false;

function assertLoggedIn() {
  if (!currentSession || !currentSession.UserID) {
    throw new Error('Unauthorized');
  }
}

function assertAdmin() {
  assertLoggedIn();
  const role = String(currentSession.Role || currentSession.RoleName || '');
  if (role !== 'Admin') {
    throw new Error('Forbidden');
  }
}

function formatBackupName(date = new Date()) {
  const stamp = date.toISOString().replace(/[.:]/g, '-');
  return `LMS-backup-${stamp}.accdb`;
}

function normalizeBackupFileName(fileName) {
  const safe = path.basename(String(fileName || ''));
  if (!safe.toLowerCase().endsWith('.accdb')) {
    throw new Error('Invalid backup file name.');
  }
  return safe;
}

async function listBackups() {
  await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
  const items = await fs.promises.readdir(BACKUP_DIR, { withFileTypes: true });
  const backups = [];

  for (const item of items) {
    if (!item.isFile()) continue;
    if (!item.name.toLowerCase().endsWith('.accdb')) continue;

    const fullPath = path.join(BACKUP_DIR, item.name);
    const stat = await fs.promises.stat(fullPath);
    backups.push({
      fileName: item.name,
      sizeBytes: stat.size,
      createdAt: stat.birthtime,
      modifiedAt: stat.mtime,
    });
  }

  backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return backups;
}

async function shouldCreateAutoBackup(targetPath) {
  try {
    const stat = await fs.promises.stat(targetPath);
    const last = new Date(stat.mtime).getTime();
    return (Date.now() - last) >= ONE_DAY_MS;
  } catch (_) {
    return true; // File does not exist or cannot be read.
  }
}

async function runDailyAutoBackup() {
  if (autoBackupInProgress) return;
  autoBackupInProgress = true;

  try {
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
    const autoBackupPath = path.join(BACKUP_DIR, AUTO_BACKUP_FILE);

    const needsBackup = await shouldCreateAutoBackup(autoBackupPath);
    if (!needsBackup) return;

    // Ensure Access file is not actively locked by this process before copying.
    await db.close();
    await db.resetConnection();
    await fs.promises.copyFile(DB_FILE_PATH, autoBackupPath);
    console.log('Auto-backup updated:', autoBackupPath);
  } catch (err) {
    // Do not block app startup for backup failures.
    console.error('Auto-backup skipped:', err.message);
  } finally {
    autoBackupInProgress = false;
  }
}

function startAutoBackupScheduler() {
  if (autoBackupTimer) return;

  autoBackupTimer = setInterval(() => {
    runDailyAutoBackup();
  }, AUTO_BACKUP_CHECK_INTERVAL_MS);
}

function stopAutoBackupScheduler() {
  if (!autoBackupTimer) return;
  clearInterval(autoBackupTimer);
  autoBackupTimer = null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: 'hidden',
    backgroundColor: '#fafafa',
  });

  // Start at login page
  win.loadFile('mainapp/login.html');

  // Remove default menu
  win.setMenuBarVisibility(false);
}

app.whenReady().then(async () => {
  createWindow();
  await runDailyAutoBackup();
  startAutoBackupScheduler();
});

app.on('window-all-closed', async () => {
  stopAutoBackupScheduler();
  await db.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── IPC Handlers ─────────────────────────────────────────────

// ── Auth ──
ipcMain.handle('auth:login', async (e, username, password) => {
  const result = await Auth.login(username, password);
  if (result.success) {
    currentSession = result.user;
    // Prefetch books data in the background so the Books tab loads instantly
    Promise.all([
      Books.getAll().then(data => { booksCache = data; }),
      Books.getAllBookCategories().then(data => { booksCategoriesCache = data; }),
    ]).catch(err => console.error('Books prefetch error:', err.message));
  }
  return result;
});

ipcMain.handle('auth:register', async (e, data) => {
  return Auth.register(data);
});

ipcMain.handle('auth:logout', async () => {
  currentSession = null;
  return { success: true };
});

ipcMain.handle('auth:session', async () => {
  return currentSession;
});

// ── Dashboard stats ──
ipcMain.handle('dashboard:stats', async () => {
  const [totalBooks]    = await db.query('SELECT COUNT(*) AS n FROM Books_Table');
  const [availCopies]   = await db.query("SELECT COUNT(*) AS n FROM BookCopies_Table WHERE CopyID NOT IN (SELECT CopyID FROM Loans_Table WHERE LoanStatus='Borrowed')");
  const [totalCopies]   = await db.query('SELECT COUNT(*) AS n FROM BookCopies_Table');
  const [activeMembers] = await db.query("SELECT COUNT(*) AS n FROM Members_Table WHERE Status=true");
  const [activeLoans]   = await db.query("SELECT COUNT(*) AS n FROM Loans_Table WHERE LoanStatus='Borrowed'");
  const [overdueLoans]  = await db.query("SELECT COUNT(*) AS n FROM Loans_Table WHERE LoanStatus='Borrowed' AND DueDate < Date()");


  return {
    totalBooks:    totalBooks.n,
    availCopies:   availCopies.n,
    totalCopies:   totalCopies.n,
    activeMembers: activeMembers.n,
    activeLoans:   activeLoans.n,
    overdueLoans:  overdueLoans.n,
  };
});

// Recent activity for dashboard
ipcMain.handle('dashboard:recent', async () => {
  const recentLoans = await db.query(`
    SELECT TOP 5
      l.LoanID,
      m.FirstName & ' ' & m.LastName AS MemberName,
      bk.Title AS BookTitle,
      l.DateBorrowed, l.DueDate, l.LoanStatus
    FROM (((Loans_Table l
      INNER JOIN Members_Table m ON l.MemberID = m.MemberID)
      INNER JOIN BookCopies_Table bc ON l.CopyID = bc.CopyID)
      INNER JOIN Books_Table bk ON bc.BookID = bk.BookID)
    ORDER BY l.DateBorrowed DESC
  `);

  const topBooks = await db.query(`
    SELECT TOP 5
      bk.BookID, bk.Title,
      COUNT(l.LoanID) AS BorrowCount
    FROM ((Loans_Table l
      INNER JOIN BookCopies_Table bc ON l.CopyID = bc.CopyID)
      INNER JOIN Books_Table bk ON bc.BookID = bk.BookID)
    GROUP BY bk.BookID, bk.Title
    ORDER BY 3 DESC
  `);

  return { recentLoans, topBooks };
});

// ── Books ──
ipcMain.handle('books:all', async () => {
  if (booksCache) {
    const cached = booksCache;
    return cached;
  }
  return Books.getAll();
});
ipcMain.handle('books:byId', (e, id) => Books.getById(id));
ipcMain.handle('books:authors', (e, id) => Books.getAuthors(id));
ipcMain.handle('books:categories', (e, id) => Books.getCategories(id));
ipcMain.handle('books:allCategories', async () => {
  if (booksCategoriesCache) {
    const cached = booksCategoriesCache;
    return cached;
  }
  return Books.getAllBookCategories();
});
ipcMain.handle('books:copies', (e, id) => Books.getCopies(id));
ipcMain.handle('books:search', (e, kw) => Books.search(kw));
ipcMain.handle('books:add', (e, data) => {
  booksCache = null;
  booksCategoriesCache = null;
  return Books.add(data);
});
ipcMain.handle('books:update', (e, id, data) => {
  booksCache = null;
  booksCategoriesCache = null;
  return Books.update(id, data);
});
ipcMain.handle('books:delete', (e, id) => {
  booksCache = null;
  booksCategoriesCache = null;
  return Books.delete(id);
});
ipcMain.handle('books:addCopy', (e, bookId, accNum, notes) => {
  return Books.addCopy(bookId, accNum, notes);
});
ipcMain.handle('books:updateCopyStatus', (e, copyId, status) => {
  return Books.updateCopyStatus(copyId, status);
});
ipcMain.handle('books:addCategory', (e, bookId, categoryId) => {
  booksCategoriesCache = null;
  return Books.addCategory(bookId, categoryId);
});
ipcMain.handle('books:removeCategory', (e, bookId, categoryId) => {
  booksCategoriesCache = null;
  return Books.removeCategory(bookId, categoryId);
});
ipcMain.handle('books:addCopies', (e, bookId, count) => {
  booksCache = null;
  return Books.addCopies(bookId, count);
});
ipcMain.handle('books:checkDuplicate', (e, title, excludeBookId) => {
  return Books.checkDuplicate(title, excludeBookId);
});

// ── Members ──
ipcMain.handle('members:all', () => {
  return Members.getAll();
});
ipcMain.handle('members:byId', (e, id) => {
  return Members.getById(id);
});
ipcMain.handle('members:search', (e, kw) => {
  return Members.search(kw);
});
ipcMain.handle('members:add', (e, data) => {
  return Members.add(data);
});
ipcMain.handle('members:update', (e, id, data) => {
  return Members.update(id, data);
});
ipcMain.handle('members:updateStatus', (e, id, status) => {
  return Members.updateStatus(id, status);
});
ipcMain.handle('members:updatePassword', (e, id, password) => {
  return Members.updatePassword(id, Auth.hashPassword(password));
});
ipcMain.handle('members:delete', (e, id) => {
  return Members.delete(id);
});
ipcMain.handle('members:history', (e, id) => {
  return Members.getBorrowHistory(id);
});

// ── Borrowing ──
ipcMain.handle('loans:all', () => {
  return Borrowing.getAll();
});
ipcMain.handle('loans:active', () => {
  return Borrowing.getActive();
});
ipcMain.handle('loans:overdue', () => {
  return Borrowing.getOverdue();
});
ipcMain.handle('loans:returned', () => {
  return Borrowing.getReturned();
});
ipcMain.handle('loans:formMembers', () => {
  return Borrowing.getBorrowFormMembers();
});
ipcMain.handle('loans:formBooks', () => {
  return Borrowing.getBorrowFormBooks();
});
ipcMain.handle('loans:modalBooks', (e, search) => {
  return Borrowing.getModalBooks(search);
});
ipcMain.handle('loans:byId', (e, id) => {
  return Borrowing.getById(id);
});
ipcMain.handle('loans:borrow', (e, memberId, copyId, issuedBy, days) => {
  return Borrowing.borrow(memberId, copyId, issuedBy, days);
});
ipcMain.handle('loans:return', (e, loanId, copyId, conditionStatus, conditionNotes) => {
  return Borrowing.returnBook(loanId, copyId, conditionStatus, conditionNotes);
});
ipcMain.handle('loans:availableCopies', (e, bookId, search, limit) => {
  return Borrowing.getAvailableCopiesByBook(bookId, search, limit);
});


// ── Lookups ──
ipcMain.handle('authors:all', () => Authors.getAll());
ipcMain.handle('categories:all', () => Categories.getAll());

ipcMain.handle('users:all', () => {
  return Users.getAll();
});
ipcMain.handle('users:byRole', (e, role) => {
  return Users.getByRole(role);
});
ipcMain.handle('users:byId', (e, id) => {
  return Users.getById(id);
});
ipcMain.handle('users:update', async (e, id, data) => {
  const existing = await Users.findByUsername(data.username);
  if (existing.some(user => Number(user.UserID) !== Number(id))) {
    return { success: false, message: 'Username is already taken. Please choose another.' };
  }

  await Users.update(id, data);
  return { success: true };
});
ipcMain.handle('users:updateStatus', async (e, id, status) => {
  await Users.updateStatus(id, status);
  return { success: true };
});
ipcMain.handle('users:updatePassword', async (e, id, password) => {
  await Users.updatePassword(id, Auth.hashPassword(password));
  return { success: true };
});
ipcMain.handle('roles:all', () => {
  return Roles.getAll();
});

// ── Backup & Recovery (Admin Only) ──
ipcMain.handle('backup:list', async () => {
  assertAdmin();
  return listBackups();
});

ipcMain.handle('backup:create', async () => {
  assertAdmin();

  await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
  const fileName = formatBackupName();
  const backupPath = path.join(BACKUP_DIR, fileName);

  await db.close();
  await db.resetConnection();
  await fs.promises.copyFile(DB_FILE_PATH, backupPath);

  return {
    success: true,
    fileName,
    backupPath,
  };
});

ipcMain.handle('backup:restore', async (e, fileName) => {
  assertAdmin();

  const safeName = normalizeBackupFileName(fileName);
  const sourcePath = path.join(BACKUP_DIR, safeName);

  await fs.promises.access(sourcePath, fs.constants.F_OK);
  await db.close();
  await db.resetConnection();
  await fs.promises.copyFile(sourcePath, DB_FILE_PATH);

  return {
    success: true,
    restoredFrom: safeName,
  };
});

ipcMain.handle('backup:delete', async (e, fileName) => {
  assertAdmin();

  const safeName = normalizeBackupFileName(fileName);
  const targetPath = path.join(BACKUP_DIR, safeName);
  await fs.promises.unlink(targetPath);

  return { success: true };
});

```
