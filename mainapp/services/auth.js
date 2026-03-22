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
        `SELECT UserID, Username, Password, FirstName, LastName,
                Email, Status, RoleID
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

    try {
      if (user.RoleID) {
        const roleRows = await db.query(
          `SELECT RoleName FROM Roles_Table WHERE RoleID = ?`,
          [user.RoleID]
        );
        user.RoleName = roleRows && roleRows.length > 0 ? roleRows[0].RoleName : null;
      } else {
        user.RoleName = null;
      }
    } catch (err) {
      console.error('Role query error:', err.message);
      user.RoleName = null;
    }

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
        RoleID:    user.RoleID,
        RoleName:  user.RoleName,
      }
    };
  },

  /**
   * Register a new user account.
   * Returns { success: true } or { success: false, message: '...' }
   */
  register: async ({ firstName, lastName, email, username, password, roleId = 3 }) => {

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

    try {
      await db.BeginTrans();

      await db.execute(
        `INSERT INTO Users_Table (Username, Password, RoleID, FirstName, LastName, Email, Status, DateCreated)
         VALUES (?, ?, ?, ?, ?, ?, true, Date())`,
        [username, passwordHash, roleId, firstName, lastName, email || '']
      );

      // Only insert into Members_Table if it's a Member role (assumed 3)
      if (roleId === 3) {
        await db.execute(
          `INSERT INTO Members_Table (FirstName, LastName, Email, Phone, Address, DateRegistered, Status)
           VALUES (?, ?, ?, ?, ?, Date(), true)`,
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
