const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

// Import services
const db       = require('./mainapp/services/db');
const Auth     = require('./mainapp/services/auth');
const Books    = require('./mainapp/services/books');
const Members  = require('./mainapp/services/members');
const Borrowing = require('./mainapp/services/borrowing');
const { Authors, Categories, Publishers, Users, Roles, AuditLogs } = require('./mainapp/services/lookup');

// ── Simple in-process session store ──────────────────────────
// Stores { UserID, Username, RoleName, ... } after successful login.
let currentSession = null;

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

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
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
  const [totalBooks]    = await db.query('SELECT COUNT(*) AS n FROM Books');
  const [availCopies]   = await db.query("SELECT COUNT(*) AS n FROM BookCopies WHERE CopyStatus='Available'");
  const [totalCopies]   = await db.query('SELECT COUNT(*) AS n FROM BookCopies');
  const [activeMembers] = await db.query("SELECT COUNT(*) AS n FROM Members WHERE MembershipStatus='Active'");
  const [activeLoans]   = await db.query("SELECT COUNT(*) AS n FROM Loans WHERE LoanStatus='Borrowed'");
  const [overdueLoans]  = await db.query("SELECT COUNT(*) AS n FROM Loans WHERE LoanStatus='Borrowed' AND DueDate < Date()");
  const [unpaidFines]   = await db.query("SELECT COUNT(*) AS n FROM Fines WHERE FineStatus='Unpaid'");

  return {
    totalBooks:    totalBooks.n,
    availCopies:   availCopies.n,
    totalCopies:   totalCopies.n,
    activeMembers: activeMembers.n,
    activeLoans:   activeLoans.n,
    overdueLoans:  overdueLoans.n,
    unpaidFines:   unpaidFines.n,
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
    FROM ((Loans l
      INNER JOIN Members m ON l.MemberID = m.MemberID)
      INNER JOIN BookCopies bc ON l.CopyID = bc.CopyID)
      INNER JOIN Books bk ON bc.BookID = bk.BookID
    ORDER BY l.DateBorrowed DESC
  `);

  const topBooks = await db.query(`
    SELECT TOP 5
      bk.BookID, bk.Title,
      COUNT(l.LoanID) AS BorrowCount
    FROM Loans l
      INNER JOIN BookCopies bc ON l.CopyID = bc.CopyID
      INNER JOIN Books bk ON bc.BookID = bk.BookID
    GROUP BY bk.BookID, bk.Title
    ORDER BY BorrowCount DESC
  `);

  return { recentLoans, topBooks };
});

// ── Books ──
ipcMain.handle('books:all', () => Books.getAll());
ipcMain.handle('books:byId', (e, id) => Books.getById(id));
ipcMain.handle('books:authors', (e, id) => Books.getAuthors(id));
ipcMain.handle('books:categories', (e, id) => Books.getCategories(id));
ipcMain.handle('books:copies', (e, id) => Books.getCopies(id));
ipcMain.handle('books:search', (e, kw) => Books.search(kw));
ipcMain.handle('books:add', (e, data) => Books.add(data));
ipcMain.handle('books:update', (e, id, data) => Books.update(id, data));
ipcMain.handle('books:delete', (e, id) => Books.delete(id));
ipcMain.handle('books:addCopy', (e, bookId, accNum, notes) => Books.addCopy(bookId, accNum, notes));
ipcMain.handle('books:updateCopyStatus', (e, copyId, status) => Books.updateCopyStatus(copyId, status));

// ── Members ──
ipcMain.handle('members:all', () => Members.getAll());
ipcMain.handle('members:byId', (e, id) => Members.getById(id));
ipcMain.handle('members:search', (e, kw) => Members.search(kw));
ipcMain.handle('members:add', (e, data) => Members.add(data));
ipcMain.handle('members:update', (e, id, data) => Members.update(id, data));
ipcMain.handle('members:updateStatus', (e, id, status) => Members.updateStatus(id, status));
ipcMain.handle('members:delete', (e, id) => Members.delete(id));
ipcMain.handle('members:history', (e, id) => Members.getBorrowHistory(id));

// ── Borrowing ──
ipcMain.handle('loans:all', () => Borrowing.getAll());
ipcMain.handle('loans:active', () => Borrowing.getActive());
ipcMain.handle('loans:overdue', () => Borrowing.getOverdue());
ipcMain.handle('loans:returned', () => Borrowing.getReturned());
ipcMain.handle('loans:byId', (e, id) => Borrowing.getById(id));
ipcMain.handle('loans:borrow', (e, memberId, copyId, issuedBy, days) => Borrowing.borrow(memberId, copyId, issuedBy, days));
ipcMain.handle('loans:return', (e, loanId, copyId, condition) => Borrowing.returnBook(loanId, copyId, condition));
ipcMain.handle('loans:payFine', (e, fineId) => Borrowing.payFine(fineId));
ipcMain.handle('loans:waiveFine', (e, fineId) => Borrowing.waiveFine(fineId));

// ── Lookups ──
ipcMain.handle('authors:all', () => Authors.getAll());
ipcMain.handle('categories:all', () => Categories.getAll());
ipcMain.handle('publishers:all', () => Publishers.getAll());
ipcMain.handle('users:all', () => Users.getAll());
ipcMain.handle('roles:all', () => Roles.getAll());
