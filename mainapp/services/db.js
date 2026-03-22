/**
 * db.js - Database connection and query helpers
 * Uses ODBC to connect to Microsoft Access (.accdb)
 */

const odbc = require('odbc');
const path = require('path');

const DATABASE_PATH = path.join(__dirname, '..', 'data', 'LMS.accdb');
const CONNECTION_STRING = `Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=${DATABASE_PATH};`;

let _connection = null;
let _ensureIndexesPromise = null;

const STARTUP_INDEXES = [
  "CREATE INDEX idx_books_title ON Books_Table ([Title])",
  "CREATE INDEX idx_books_isbn ON Books_Table ([ISBN])",
  "CREATE INDEX idx_copies_bookid ON BookCopies_Table ([BookID])",
  "CREATE INDEX idx_copies_accession ON BookCopies_Table ([AccessionNumber])",
  "CREATE INDEX idx_loans_copyid ON Loans_Table ([CopyID])",
  "CREATE INDEX idx_loans_memberid ON Loans_Table ([MemberID])",
  "CREATE INDEX idx_loans_status ON Loans_Table ([LoanStatus])",
  "CREATE INDEX idx_members_lastname ON Members_Table ([LastName])",
  "CREATE INDEX idx_members_email ON Members_Table ([Email])",
  "CREATE INDEX idx_categories_name ON Categories_Table ([CategoryName])"
];

async function ensureIndexes(conn) {
  if (_ensureIndexesPromise) return _ensureIndexesPromise;

  _ensureIndexesPromise = (async () => {
    for (const sql of STARTUP_INDEXES) {
      try {
        await conn.query(sql);
      } catch (err) {
        // Best-effort optimization only. Ignore existing/unsupported index errors.
      }
    }
  })();

  return _ensureIndexesPromise;
}

/**
 * Returns a singleton connection. Reconnects if closed.
 */
async function getConnection() {
  if (_connection) return _connection;
  try {
    _connection = await odbc.connect(CONNECTION_STRING);
    await ensureIndexes(_connection);
    console.log('✅ DB connected:', DATABASE_PATH);
    return _connection;
  } catch (err) {
    console.error('❌ DB connection failed:', err.message);
    throw err;
  }
}

/**
 * Utility function to manually interpolate parameters into SQL.
 * This bypasses the MS Access ODBC driver issue where it cannot glean parameter types.
 */
function buildSql(sql, params) {
  if (!params || !params.length) return sql;
  const parts = sql.split('?');
  if (parts.length - 1 !== params.length) {
     console.warn('Parameter count mismatch in buildSql. SQL:', sql, 'Params:', params);
  }
  let result = parts[0];
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    let val;
    if (typeof param === 'string') {
      val = "'" + param.replace(/'/g, "''") + "'";
    } else if (typeof param === 'boolean') {
      val = param ? 'TRUE' : 'FALSE';
    } else if (param instanceof Date) {
      val = "#" + param.toISOString() + "#";
    } else if (param === null || param === undefined) {
      val = 'NULL';
    } else {
      val = param;
    }
    result += val + (parts[i + 1] !== undefined ? parts[i + 1] : '');
  }
  return result;
}

/**
 * Run a SELECT query, returns array of row objects.
 * @param {string} sql
 * @param {Array}  params - optional positional params (?)
 */
async function query(sql, params = []) {
  const conn = await getConnection();
  const safeSql = buildSql(sql, params);
  try {
    const result = await conn.query(safeSql);
    return Array.from(result);
  } catch (err) {
    console.error('Query error:', err.message, '\nSQL:', safeSql);
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
  const safeSql = buildSql(sql, params);
  // MS Access ODBC prepare/bind often fails, so we bypass prepareStatement entirely
  // and run it directly since parameters are safely interpolated.
  try {
    const result = await conn.query(safeSql);
    return result;
  } catch (err) {
    console.error('Execute error:', err.message, '\nSQL:', safeSql);
    throw err;
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

/**
 * Transaction handlers
 */
async function BeginTrans() {
  const conn = await getConnection();
  await conn.beginTransaction();
}

async function CommitTrans() {
  const conn = await getConnection();
  await conn.commit();
}

async function Rollback() {
  const conn = await getConnection();
  await conn.rollback();
}

async function resetConnection() {
  if (_connection) {
    try { await _connection.close(); } catch (e) {}
    _connection = null;
  }
  _ensureIndexesPromise = null;
}

// Test connection when run directly: node mainapp/services/db.js
if (require.main === module) {
  (async () => {
    await getConnection();
    await close();
  })();
}

module.exports = { query, execute, close, BeginTrans, CommitTrans, Rollback, resetConnection };
