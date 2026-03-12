/**
 * db.js - Microsoft Access (.accdb) Database Connection Module
 * Uses node-adodb (requires 32-bit Node.js on Windows or ADODB support)
 *
 * Install dependency: npm install node-adodb
 */

const ADODB = require('node-adodb');

// ── Connection String ──────────────────────────────────────────────────────────
// Update DATABASE_PATH to point to your .accdb file
const DATABASE_PATH = require('path').join(__dirname, '..', 'data', 'LMS.accdb');

const CONNECTION_STRING =
  `Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${DATABASE_PATH};Persist Security Info=False;`;

// If your .accdb file has a password, use:
// `Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${DATABASE_PATH};Jet OLEDB:Database Password=yourpassword;`

// ── Create Connection ──────────────────────────────────────────────────────────
const connection = ADODB.open(CONNECTION_STRING);

module.exports = connection;
