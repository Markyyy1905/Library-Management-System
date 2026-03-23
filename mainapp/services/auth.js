/**
 * auth.js - Authentication service
 * Handles login verification and account registration.
 * Uses a simple SHA-256 hash for passwords (via Node's crypto module).
 * For production, swap to bcrypt.
 */

const db     = require('./db');
const crypto = require('crypto');

const VALID_ROLES = new Set(['Admin', 'Librarian', 'Member']);

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
    // Status is boolean based on schema. true/false or 1/0 or -1/0. Assuming JS true/1
    if (!user.Status) {
      return { success: false, message: 'Your account is inactive. Contact an administrator.' };
    }

    if (!verifyPassword(password, user.Password)) {
      return { success: false, message: 'Invalid username or password.' };
    }

    // Return safe user object (no password hash)
    return {
      success: true,
      user: {
        UserID:    user.UserID,
        Username:  user.Username,
        FirstName: user.FirstName,
        LastName:  user.LastName,
        Email:     user.Email,
        Role:      normalizeRole(user.Role),
      }
    };
  },

  /**
   * Register a new user account.
   * Returns { success: true } or { success: false, message: '...' }
   */
  register: async ({ firstName, lastName, email, username, password, role = 'Member' }) => {

    if (!firstName || !lastName || !username || !password) {
      return { success: false, message: 'All required fields must be filled.' };
    }
    if (password.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters.' };
    }

    // Check username uniqueness
    let existing;
    try {
      existing = await db.query('SELECT UserID FROM Users_Table WHERE Username = ?', [username]);
    } catch (err) {
      return { success: false, message: 'Database error checking username.' };
    }

    if (existing && existing.length > 0) {
      return { success: false, message: 'Username is already taken. Please choose another.' };
    }

    const passwordHash = hashPassword(password);
    const normalizedRole = normalizeRole(role);

    try {
      await db.BeginTrans();

      await db.execute(
        `INSERT INTO Users_Table (Username, Password, Role, FirstName, LastName, Email, Status, DateCreated)
         VALUES (?, ?, ?, ?, ?, ?, 'Active', Date())`,  
        [username, passwordHash, normalizedRole, firstName, lastName, email || '']
      );

      // Only insert into Members_Table if role is Member.
      if (normalizedRole === 'Member') {
        await db.execute(
          `INSERT INTO Members_Table (FirstName, LastName, Email, Phone, Address, DateRegistered, Status)
           VALUES (?, ?, ?, ?, ?, Date(), 'Active')`,
          [firstName, lastName, email || '', '', '']
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
