/**
 * db.js - Database connection and query helpers
 * Uses ODBC to connect to Microsoft Access (.accdb)
 */

const odbc = require('odbc');
const path = require('path');

const DATABASE_PATH = path.join(__dirname, '..', 'data', 'LMS.accdb');
const CONNECTION_STRING = `Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=${DATABASE_PATH};`;

let _connection = null;

/**
 * Returns a singleton connection. Reconnects if closed.
 */
async function getConnection() {
  if (_connection) return _connection;
  try {
    _connection = await odbc.connect(CONNECTION_STRING);
    console.log('✅ DB connected:', DATABASE_PATH);
    return _connection;
  } catch (err) {
    console.error('❌ DB connection failed:', err.message);
    throw err;
  }
}

/**
 * Run a SELECT query, returns array of row objects.
 * @param {string} sql
 * @param {Array}  params - optional positional params (?)
 */
async function query(sql, params = []) {
  const conn = await getConnection();
  try {
    const result = await conn.query(sql, params);
    return Array.from(result);
  } catch (err) {
    console.error('Query error:', err.message, '\nSQL:', sql);
    throw err;
  }
}

/**
 * Run an INSERT / UPDATE / DELETE, returns result object.
 * @param {string} sql
 * @param {Array}  params - optional positional params (?)
 */
async function execute(sql, params = []) {
  const conn = await getConnection();
  try {
    const stmt = await conn.createStatement();
    await stmt.prepare(sql);
    if (params.length) await stmt.bind(params);
    const result = await stmt.execute();
    await stmt.close();
    return result;
  } catch (err) {
    // Fallback: some ODBC versions don't support createStatement
    try {
      const result = await conn.query(sql, params);
      return result;
    } catch (err2) {
      console.error('Execute error:', err2.message, '\nSQL:', sql);
      throw err2;
    }
  }
}

/**
 * Close the connection (call on app quit).
 */
async function close() {
  if (_connection) {
    await _connection.close();
    _connection = null;
    console.log('DB connection closed.');
  }
}

// Test connection when run directly: node mainapp/services/db.js
if (require.main === module) {
  (async () => {
    await getConnection();
    await close();
  })();
}

module.exports = { query, execute, close };
