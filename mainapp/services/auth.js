/**
 * auth.js - Authentication service
 * Handles login verification and account registration.
 * Uses a simple SHA-256 hash for passwords (via Node's crypto module).
 * For production, swap to bcrypt.
 */

const db     = require('./db');
const crypto = require('crypto');

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
        `SELECT u.UserID, u.Username, u.PasswordHash, u.FirstName, u.LastName,
                u.Email, u.AccountStatus, u.RoleID, r.RoleName
         FROM Users_Table u LEFT JOIN Roles_Table r ON u.RoleID = r.RoleID
         WHERE u.Username = ?`,
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

    if (user.AccountStatus !== 'Active') {
      return { success: false, message: 'Your account is inactive. Contact an administrator.' };
    }

    if (!verifyPassword(password, user.PasswordHash)) {
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
        RoleID:    user.RoleID,
        RoleName:  user.RoleName,
      }
    };
  },

  /**
   * Register a new user account.
   * Returns { success: true } or { success: false, message: '...' }
   */
  register: async ({ firstName, lastName, email, username, roleId, password }) => {
    if (!firstName || !lastName || !username || !password || !roleId) {
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

    try {
      await db.execute(
        `INSERT INTO Users_Table (Username, PasswordHash, RoleID, FirstName, LastName, Email, AccountStatus, DateCreated)
         VALUES (?, ?, ?, ?, ?, ?, 'Active', Date())`,
        [username, passwordHash, roleId, firstName, lastName, email || '']
      );
      return { success: true };
    } catch (err) {
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
