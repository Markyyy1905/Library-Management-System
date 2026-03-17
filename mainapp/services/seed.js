/**
 * seed.js - Run once to create a default Admin user.
 * Usage (from project root): node mainapp/services/seed.js
 *
 * Default credentials:
 *   Username: admin
 *   Password: admin123
 *
 * Change the password immediately after first login!
 */

const db   = require('./db');
const Auth = require('./auth');

(async () => {
  try {
    console.log('Connecting to database…');
    await db.query('SELECT 1 FROM Users_Table'); // test connection

    // Check if admin already exists
    const existing = await db.query("SELECT UserID FROM Users_Table WHERE Username = 'admin'");
    if (existing.length > 0) {
      console.log('✅ Admin user already exists. Skipping seed.');
      await db.close();
      return;
    }

    // Ensure Roles exist
    const roles = await db.query('SELECT * FROM Roles_Table');
    if (roles.length === 0) {
      console.log('Creating default roles…');
      await db.execute("INSERT INTO Roles_Table (RoleName) VALUES ('Admin')");
      await db.execute("INSERT INTO Roles_Table (RoleName) VALUES ('Librarian')");
      await db.execute("INSERT INTO Roles_Table (RoleName) VALUES ('Staff')");
      console.log('✅ Roles created.');
    }

    // Get Admin role ID
    const adminRole = await db.query("SELECT RoleID FROM Roles_Table WHERE RoleName = 'Admin'");
    const roleId    = adminRole[0].RoleID;

    const passwordHash = Auth.hashPassword('admin123');

    await db.execute(
      `INSERT INTO Users_Table (Username, PasswordHash, RoleID, FirstName, LastName, Email, AccountStatus, DateCreated)
       VALUES (?, ?, ?, ?, ?, ?, 'Active', Date())`,
      ['admin', passwordHash, roleId, 'Admin', 'User', 'admin@library.local']
    );

    console.log('✅ Default admin created!');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('   ⚠  Change this password immediately after logging in!');

  } catch (err) {
    console.error('❌ Seed failed:', err.message);
  } finally {
    await db.close();
  }
})();
