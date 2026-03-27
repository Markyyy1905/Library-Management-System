/**
 * auth.js - Authentication service
 * Handles login verification and account registration.
 * Uses a simple SHA-256 hash for passwords (via Node's crypto module).
 * For production, swap to bcrypt.
 */

const db = require('./db');
const crypto = require('crypto');

const VALID_ROLES = new Set(['Admin', 'Librarian', 'Member']);
const NAME_REGEX = /^[A-Za-zÀ-ÿ\s\-']+$/;
const USERNAME_REGEX = /^[A-Za-z0-9]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRole(inputRole) {
  if (typeof inputRole !== 'string') return 'Member';
  const role = inputRole.trim();
  return VALID_ROLES.has(role) ? role : 'Member';
}

/**
 * Hash a plain-text password with SHA-256 + a static salt prefix.
 * To use bcrypt instead: npm install bcryptjs  and replace these two functions.
 */
function hashPassword(plain) {
  return crypto.createHash('sha256').update('LMS_SALT_' + plain).digest('hex');
}

function verifyPassword(plain, hash) {
  return hashPassword(plain) === hash;
}

const Auth = {

  /**
   * Attempt login.
   * Returns { success: true, user: {...} } or { success: false, message: '...' }
   */
  login: async (username, password) => {
    if (!username || !password) {
      return { success: false, message: 'Username and password are required.' };
    }

    let rows;
    try {
      rows = await db.query(
        `SELECT UserID, Username, Password, FirstName, LastName,
                Email, Status, Role
         FROM Users_Table
         WHERE Username = ?`,
        [username]
      );
    } catch (err) {
      console.error('Login query error:', err.message);
      return { success: false, message: 'Database error. Please try again.' };
    }

    if (!rows || rows.length === 0) {
      return { success: false, message: 'Invalid username or password.' };
    }

    const user = rows[0];
    // Access Yes/No fields return -1 (True) or 0 (False) via ODBC.
    // Guard against all falsy representations: 0, false, null, '0', 'false', ''.
    const statusVal = user.Status;
    const isActive = statusVal !== 0
      && statusVal !== false
      && statusVal != null
      && statusVal !== '0'
      && statusVal !== 'false'
      && statusVal !== '';
    if (!isActive) {
      return { success: false, message: 'Your account is deactivated or suspended. Contact an administrator.' };
    }

    if (!verifyPassword(password, user.Password)) {
      return { success: false, message: 'Invalid username or password.' };
    }

    const assignedRole = normalizeRole(user.Role);

    // Auto-awake Inactive members
    if (assignedRole === 'Member') {
      try {
        const memRows = await db.query('SELECT MemberID, Status FROM Members_Table WHERE UserID = ?', [user.UserID]);
        if (memRows && memRows.length > 0 && memRows[0].Status === 'Inactive') {
          await db.execute("UPDATE Members_Table SET Status = 'Active' WHERE MemberID = ?", [memRows[0].MemberID]);
        }
      } catch (err) {
        console.error('Failed to wake up inactive member:', err.message);
      }
    }

    // Return safe user object (no password hash)
    return {
      success: true,
      user: {
        UserID: user.UserID,
        Username: user.Username,
        FirstName: user.FirstName,
        LastName: user.LastName,
        Email: user.Email,
        Role: normalizeRole(user.Role),
      }
    };
  },

  /**
   * Register a new user account.
   * Returns { success: true } or { success: false, message: '...' }
   */
  register: async ({ firstName, lastName, email, username, password, role = 'Member' }) => {

    const safeFirstName = String(firstName || '').trim();
    const safeLastName = String(lastName || '').trim();
    const safeEmail = String(email || '').trim();
    const safeUsername = String(username || '').trim();
    const safePassword = String(password || '');

    if (!safeFirstName || !safeLastName || !safeUsername || !safePassword) {
      return { success: false, message: 'All required fields must be filled.' };
    }
    if (!NAME_REGEX.test(safeFirstName) || !NAME_REGEX.test(safeLastName)) {
      return { success: false, message: 'First and last name must contain text only.' };
    }
    if (!USERNAME_REGEX.test(safeUsername)) {
      return { success: false, message: 'Username must be alphanumeric only.' };
    }
    if (safeEmail && !EMAIL_REGEX.test(safeEmail)) {
      return { success: false, message: 'Email format is invalid.' };
    }
    if (safePassword.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters.' };
    }

    // Check username uniqueness
    let existing;
    try {
      existing = await db.query('SELECT UserID FROM Users_Table WHERE Username = ?', [safeUsername]);
    } catch (err) {
      return { success: false, message: 'Database error checking username.' };
    }

    if (existing && existing.length > 0) {
      return { success: false, message: 'Username is already taken. Please choose another.' };
    }

    const passwordHash = hashPassword(safePassword);
    const normalizedRole = normalizeRole(role);

    try {
      await db.BeginTrans();

      await db.execute(
        `INSERT INTO Users_Table (Username, Password, Role, FirstName, LastName, Email, Status, DateCreated)
         VALUES (?, ?, ?, ?, ?, ?, 1, Date())`,
        [safeUsername, passwordHash, normalizedRole, safeFirstName, safeLastName, safeEmail]
      );

      // Only insert into Members_Table if role is Member.
      if (normalizedRole === 'Member') {
        await db.execute(
          `INSERT INTO Members_Table (FirstName, LastName, Email, Phone, Address, DateRegistered, Status)
           VALUES (?, ?, ?, ?, ?, Date(), 'Active')`,
          [safeFirstName, safeLastName, safeEmail, '', '']
        );
      }

      await db.CommitTrans();
      return { success: true };
    } catch (err) {
      await db.Rollback();
      console.error('Register error:', err.message);
      return { success: false, message: 'Failed to create account: ' + err.message };
    }
  },

  /**
   * Utility: hash a plain password (used for seeding default admin).
   */
  hashPassword,
};

module.exports = Auth;
