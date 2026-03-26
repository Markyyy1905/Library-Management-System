/**
 * lookup.js - CRUD for Authors, Categories, Publishers, Users, Roles
 */

const db = require('./db');

const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;

const categoriesCache = {
  rows: null,
  fetchedAt: 0,
  pending: null,
};

function cloneRows(rows) {
  return Array.isArray(rows) ? rows.map(row => ({ ...row })) : [];
}

function hasFreshCategoriesCache() {
  return categoriesCache.rows && (Date.now() - categoriesCache.fetchedAt) < LOOKUP_CACHE_TTL_MS;
}

function invalidateCategoriesCache() {
  categoriesCache.rows = null;
  categoriesCache.fetchedAt = 0;
  categoriesCache.pending = null;
}

async function getCachedCategories() {
  if (hasFreshCategoriesCache()) {
    return cloneRows(categoriesCache.rows);
  }

  if (categoriesCache.pending) {
    const rows = await categoriesCache.pending;
    return cloneRows(rows);
  }

  categoriesCache.pending = db.query('SELECT * FROM Categories_Table ORDER BY CategoryName ASC');

  try {
    const rows = await categoriesCache.pending;
    categoriesCache.rows = rows;
    categoriesCache.fetchedAt = Date.now();
    return cloneRows(rows);
  } finally {
    categoriesCache.pending = null;
  }
}

// ── Authors ───────────────────────────────────────────────────
const Authors = {
  getAll: () => db.query(`
    SELECT AuthorID, AuthorName
    FROM AuthorsTable
    ORDER BY AuthorName ASC
  `),
};

// ── Categories ───────────────────────────────────────────────
const Categories = {
  getAll: () => getCachedCategories(),

  add: async (cat) => {
    const result = await db.execute(
      'INSERT INTO Categories_Table (CategoryName, CategoryDescription) VALUES (?, ?)',
      [cat.name, cat.description || '']
    );
    invalidateCategoriesCache();
    return result;
  },

  update: async (id, cat) => {
    const result = await db.execute(
      'UPDATE Categories_Table SET CategoryName=?, CategoryDescription=? WHERE CategoryID=?',
      [cat.name, cat.description || '', id]
    );
    invalidateCategoriesCache();
    return result;
  },

  delete: async (id) => {
    const result = await db.execute('DELETE FROM Categories_Table WHERE CategoryID=?', [id]);
    invalidateCategoriesCache();
    return result;
  },
};

// ── Removed Publishers (Moved to Books_Table directly) ─────────

// ── Users / Roles ────────────────────────────────────────────
const Users = {
  getAll: () => db.query(`
    SELECT UserID, Username, FirstName, LastName,
           Email, Status, DateCreated, Role
    FROM Users_Table
    ORDER BY LastName ASC, FirstName ASC
  `),

  getById: (id) => db.query(`
    SELECT UserID, Username, FirstName, LastName,
           Email, Status, DateCreated, Role
    FROM Users_Table
    WHERE UserID = ?
  `, [id]),

  getByRole: (role) => db.query(`
    SELECT UserID, Username, FirstName, LastName,
           Email, Status, DateCreated, Role
    FROM Users_Table
    WHERE Role = ?
    ORDER BY LastName ASC, FirstName ASC
  `, [role]),

  findByUsername: (username) => db.query(
    'SELECT * FROM Users_Table WHERE Username=?',
    [username]
  ),

  /**
   * Add user. passwordHash should already be hashed by caller.
   */
  add: (user) => db.execute(`
    INSERT INTO Users_Table (Username, Password, Role, FirstName, LastName, Email, Status, DateCreated)
    VALUES (?, ?, ?, ?, ?, ?, true, Date())
  `, [user.username, user.passwordHash, user.role, user.firstName, user.lastName, user.email || '']),

  update: (id, user) => db.execute(`
    UPDATE Users_Table
    SET Username=?, FirstName=?, LastName=?, Email=?, Role=?, Status=?
    WHERE UserID=?
  `, [user.username, user.firstName, user.lastName, user.email || '', user.role, user.status, id]),

  updateStatus: (id, status) =>
    db.execute('UPDATE Users_Table SET Status=? WHERE UserID=?', [status, id]),

  updatePassword: (id, passwordHash) =>
    db.execute('UPDATE Users_Table SET Password=? WHERE UserID=?', [passwordHash, id]),
};

const Roles = {
  getAll: () => db.query('SELECT * FROM Roles_Table ORDER BY RoleName ASC'),
};

// ── Audit Logs ───────────────────────────────────────────────
const AuditLogs = {
  log: (userId, actionType, description) => db.execute(`
    INSERT INTO AuditLogs (UserID, ActionType, ActionDescription, ActionDateTime)
    VALUES (?, ?, ?, Now())
  `, [userId, actionType, description]),

  getRecent: (limit = 50) => db.query(`
    SELECT TOP ${limit}
      al.LogID, al.ActionType, al.ActionDescription, al.ActionDateTime,
      u.FirstName & ' ' & u.LastName AS UserName
    FROM AuditLogs al LEFT JOIN Users_Table u ON al.UserID = u.UserID
    ORDER BY al.ActionDateTime DESC
  `),
};

module.exports = { Authors, Categories, Users, Roles, AuditLogs };
