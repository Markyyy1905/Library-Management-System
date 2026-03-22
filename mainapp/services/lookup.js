/**
 * lookup.js - CRUD for Authors, Categories, Publishers, Users, Roles
 */

const db = require('./db');

// ── Authors ──────────────────────────────────────────────────
const Authors = {
  getAll: () => db.query('SELECT * FROM Authors_Table ORDER BY AuthorName ASC'),

  add: (author) => db.execute(
    'INSERT INTO Authors_Table (AuthorName, AuthorCountry, BirthYear) VALUES (?, ?, ?)',
    [author.name, author.country || '', author.birthYear || null]
  ),

  update: (id, author) => db.execute(
    'UPDATE Authors_Table SET AuthorName=?, AuthorCountry=?, BirthYear=? WHERE AuthorID=?',
    [author.name, author.country || '', author.birthYear || null, id]
  ),

  delete: (id) => db.execute('DELETE FROM Authors_Table WHERE AuthorID=?', [id]),
};

// ── Categories ───────────────────────────────────────────────
const Categories = {
  getAll: () => db.query('SELECT * FROM Categories_Table ORDER BY CategoryName ASC'),

  add: (cat) => db.execute(
    'INSERT INTO Categories_Table (CategoryName, CategoryDescription) VALUES (?, ?)',
    [cat.name, cat.description || '']
  ),

  update: (id, cat) => db.execute(
    'UPDATE Categories_Table SET CategoryName=?, CategoryDescription=? WHERE CategoryID=?',
    [cat.name, cat.description || '', id]
  ),

  delete: (id) => db.execute('DELETE FROM Categories_Table WHERE CategoryID=?', [id]),
};

// ── Publishers ───────────────────────────────────────────────
const Publishers = {
  getAll: () => db.query('SELECT * FROM Publishers_Table ORDER BY PublisherName ASC'),

  add: (pub) => db.execute(
    'INSERT INTO Publishers_Table (PublisherName, PublisherAddress, PublisherContact) VALUES (?, ?, ?)',
    [pub.name, pub.address || '', pub.contact || '']
  ),

  update: (id, pub) => db.execute(
    'UPDATE Publishers_Table SET PublisherName=?, PublisherAddress=?, PublisherContact=? WHERE PublisherID=?',
    [pub.name, pub.address || '', pub.contact || '', id]
  ),

  delete: (id) => db.execute('DELETE FROM Publishers_Table WHERE PublisherID=?', [id]),
};

// ── Users / Roles ────────────────────────────────────────────
const Users = {
  getAll: () => db.query(`
    SELECT u.UserID, u.Username, u.FirstName, u.LastName,
           u.Email, u.AccountStatus, u.DateCreated, r.RoleName
    FROM Users_Table u LEFT JOIN Roles_Table r ON u.RoleID = r.RoleID
    ORDER BY u.LastName ASC
  `),

  getById: (id) => db.query(`
    SELECT u.UserID, u.Username, u.FirstName, u.LastName,
           u.Email, u.AccountStatus, u.DateCreated,
           u.RoleID, r.RoleName
    FROM Users_Table u LEFT JOIN Roles_Table r ON u.RoleID = r.RoleID
    WHERE u.UserID = ?
  `, [id]),

  findByUsername: (username) => db.query(
    'SELECT * FROM Users_Table WHERE Username=?',
    [username]
  ),

  /**
   * Add user. passwordHash should already be hashed by caller.
   */
  add: (user) => db.execute(`
    INSERT INTO Users_Table (Username, PasswordHash, RoleID, FirstName, LastName, Email, AccountStatus, DateCreated)
    VALUES (?, ?, ?, ?, ?, ?, 'Active', Date())
  `, [user.username, user.passwordHash, user.roleId, user.firstName, user.lastName, user.email || '']),

  update: (id, user) => db.execute(`
    UPDATE Users_Table SET FirstName=?, LastName=?, Email=?, RoleID=? WHERE UserID=?
  `, [user.firstName, user.lastName, user.email || '', user.roleId, id]),

  updateStatus: (id, status) =>
    db.execute('UPDATE Users_Table SET AccountStatus=? WHERE UserID=?', [status, id]),

  updatePassword: (id, passwordHash) =>
    db.execute('UPDATE Users_Table SET PasswordHash=? WHERE UserID=?', [passwordHash, id]),
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

module.exports = { Authors, Categories, Publishers, Users, Roles, AuditLogs };
