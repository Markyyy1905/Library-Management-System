/**
 * books.js - Book CRUD operations (3NF schema)
 * Tables: Books, BookAuthors, BookCategories, BookCopies, Authors, Categories, Publishers
 */

const db = require('./db');

function normalizeAuthorName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}

function splitAuthorNames(authorInput) {
  const parts = Array.isArray(authorInput)
    ? authorInput
    : String(authorInput || '').split(',');

  const seen = new Set();
  const names = [];

  for (const part of parts) {
    const name = normalizeAuthorName(part);
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    names.push(name);
  }

  return names;
}

async function getAuthorRowsByBookIds(bookIds) {
  const ids = Array.from(new Set((bookIds || []).map(id => Number(id)).filter(Boolean)));
  if (!ids.length) return [];

  const chunkSize = 100;
  const rows = [];

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const chunkRows = await db.query(`
      SELECT ab.BookID, a.AuthorID, a.AuthorName
      FROM AuthorBooksTable ab
        INNER JOIN AuthorsTable a ON ab.AuthorID = a.AuthorID
      WHERE ab.BookID IN (${chunk.join(',')})
      ORDER BY ab.BookID ASC, a.AuthorName ASC
    `);
    rows.push(...chunkRows);
  }

  return rows;
}

function attachAuthors(rows, authorRows) {
  const authorMap = new Map();

  for (const row of authorRows || []) {
    const bookId = Number(row.BookID);
    if (!authorMap.has(bookId)) {
      authorMap.set(bookId, []);
    }

    authorMap.get(bookId).push({
      AuthorID: row.AuthorID,
      AuthorName: row.AuthorName,
    });
  }

  return (rows || []).map(row => {
    const authors = authorMap.get(Number(row.BookID)) || [];
    return {
      ...row,
      Authors: authors,
      Author: authors.length ? authors.map(author => author.AuthorName).join(', ') : '',
    };
  });
}

async function getCategoryRowsByBookIds(bookIds) {
  const ids = Array.from(new Set((bookIds || []).map(id => Number(id)).filter(Boolean)));
  if (!ids.length) return [];

  const chunkSize = 100;
  const rows = [];

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const chunkRows = await db.query(`
      SELECT bc.BookID, c.CategoryID, c.CategoryName
      FROM BookCategories bc
        INNER JOIN Categories_Table c ON bc.CategoryID = c.CategoryID
      WHERE bc.BookID IN (${chunk.join(',')})
      ORDER BY bc.BookID ASC, c.CategoryName ASC
    `);
    rows.push(...chunkRows);
  }

  return rows;
}

function attachCategories(rows, categoryRows) {
  const categoryMap = new Map();

  for (const row of categoryRows || []) {
    const bookId = Number(row.BookID);
    if (!categoryMap.has(bookId)) {
      categoryMap.set(bookId, { ids: [], names: [] });
    }
    categoryMap.get(bookId).ids.push(row.CategoryID);
    categoryMap.get(bookId).names.push(row.CategoryName);
  }

  return (rows || []).map(row => {
    const entry = categoryMap.get(Number(row.BookID)) || { ids: [], names: [] };
    return {
      ...row,
      CategoryIDs: entry.ids,
      CategoryNames: entry.names,
    };
  });
}

async function getBookAuthorDisplayRows(bookId) {
  return db.query(`
    SELECT a.AuthorID, a.AuthorName
    FROM AuthorBooksTable ab
      INNER JOIN AuthorsTable a ON ab.AuthorID = a.AuthorID
    WHERE ab.BookID = ?
    ORDER BY a.AuthorName ASC
  `, [bookId]);
}

async function findOrCreateAuthorId(authorName) {
  const normalized = normalizeAuthorName(authorName);
  if (!normalized) return null;

  const existing = await db.query(`
    SELECT TOP 1 AuthorID, AuthorName
    FROM AuthorsTable
    WHERE LCase(Trim(AuthorName)) = ?
    ORDER BY AuthorID ASC
  `, [normalized.toLowerCase()]);

  if (existing.length) {
    return existing[0].AuthorID;
  }

  await db.execute('INSERT INTO AuthorsTable (AuthorName) VALUES (?)', [normalized]);

  const inserted = await db.query(`
    SELECT TOP 1 AuthorID, AuthorName
    FROM AuthorsTable
    WHERE LCase(Trim(AuthorName)) = ?
    ORDER BY AuthorID DESC
  `, [normalized.toLowerCase()]);

  if (!inserted.length) {
    throw new Error(`Failed to create author record for ${normalized}.`);
  }

  return inserted[0].AuthorID;
}

async function syncBookAuthors(bookId, authorInput) {
  const names = splitAuthorNames(authorInput);

  await db.execute('DELETE FROM AuthorBooksTable WHERE BookID=?', [bookId]);

  for (const name of names) {
    const authorId = await findOrCreateAuthorId(name);
    await db.execute(
      'INSERT INTO AuthorBooksTable (AuthorID, BookID) VALUES (?, ?)',
      [authorId, bookId]
    );
  }
}

async function getInsertedBookId(title, isbn) {
  try {
    const identityRows = await db.query('SELECT @@IDENTITY AS NewID');
    const identity = identityRows.length ? Number(identityRows[0].NewID) : 0;
    if (identity) return identity;
  } catch (_) {
    // Fallback below for Access drivers that do not expose @@IDENTITY consistently.
  }

  const rows = await db.query(`
    SELECT TOP 1 BookID
    FROM Books_Table
    WHERE Title = ? AND ((ISBN IS NULL AND ? IS NULL) OR ISBN = ?)
    ORDER BY BookID DESC
  `, [title, isbn || null, isbn || null]);

  if (!rows.length) {
    throw new Error('Failed to determine the newly inserted book ID.');
  }

  return rows[0].BookID;
}

const Books = {

  /**
   * Full book list with author names, categories, publisher, and copy counts.
   */
  getAll: async () => {
    const rows = await db.query(`
      SELECT
        b.BookID,
        b.Title,
        b.ISBN,
        b.YearPublished,
        b.Language,
        b.Publisher,
        (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID) AS TotalCopies,
        (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID AND bc.CopyID NOT IN (SELECT CopyID FROM Loans_Table l WHERE l.LoanStatus = 'Borrowed')) AS AvailableCopies
      FROM Books_Table b
      ORDER BY b.Title ASC
    `);

    const authorRows = await getAuthorRowsByBookIds(rows.map(row => row.BookID));
    const withAuthors = attachAuthors(rows, authorRows);
    const categoryRows = await getCategoryRowsByBookIds(rows.map(row => row.BookID));
    return attachCategories(withAuthors, categoryRows);
  },

  getById: async (id) => {
    const rows = await db.query(`
      SELECT
        b.BookID, b.Title, b.ISBN, b.YearPublished,
        b.Language, b.Publisher,
        (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID) AS TotalCopies,
        (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID AND bc.CopyID NOT IN (SELECT CopyID FROM Loans_Table l WHERE l.LoanStatus = 'Borrowed')) AS AvailableCopies
      FROM Books_Table b
      WHERE b.BookID = ?
    `, [id]);

    const authorRows = await getAuthorRowsByBookIds([id]);
    const withAuthors = attachAuthors(rows, authorRows);
    const categoryRows = await getCategoryRowsByBookIds([id]);
    return attachCategories(withAuthors, categoryRows);
  },

  getAuthors: (bookId) => getBookAuthorDisplayRows(bookId),

  /**
   * Categories for a book (from BookCategories junction).
   */
  getCategories: (bookId) => db.query(`
    SELECT c.CategoryID, c.CategoryName
    FROM BookCategories bc INNER JOIN Categories_Table c ON bc.CategoryID = c.CategoryID
    WHERE bc.BookID = ?
  `, [bookId]),

  /**
   * All book-category pairs in one query — use this to populate categories for all books at once.
   */
  getAllBookCategories: () => db.query(`
    SELECT bc.BookID, c.CategoryID, c.CategoryName
    FROM BookCategories bc INNER JOIN Categories_Table c ON bc.CategoryID = c.CategoryID
  `),

  /**
   * All copies for a book.
   */
  getCopies: (bookId) => db.query(`
    SELECT bc.CopyID, bc.AccessionNumber, bc.ConditionNotes,
           IIF(l.LoanID IS NULL, 'Available', 'Borrowed') AS CopyStatus
    FROM BookCopies_Table bc
      LEFT JOIN Loans_Table l ON (bc.CopyID = l.CopyID AND l.LoanStatus = 'Borrowed')
    WHERE bc.BookID = ?
    ORDER BY bc.AccessionNumber ASC
  `, [bookId]),

  search: async (keyword) => {
    const searchTerm = `%${String(keyword || '').trim()}%`;
    const rows = await db.query(`
      SELECT
        DISTINCT b.BookID, b.Title, b.ISBN, b.YearPublished,
        b.Publisher,
        b.Language,
        (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID) AS TotalCopies,
        (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID AND bc.CopyID NOT IN (SELECT CopyID FROM Loans_Table l WHERE l.LoanStatus = 'Borrowed')) AS AvailableCopies
      FROM (Books_Table b
        LEFT JOIN AuthorBooksTable ab ON b.BookID = ab.BookID)
        LEFT JOIN AuthorsTable a ON ab.AuthorID = a.AuthorID
      WHERE b.Title LIKE ? OR a.AuthorName LIKE ? OR b.ISBN LIKE ?
      ORDER BY b.Title ASC
    `, [searchTerm, searchTerm, searchTerm]);

    const authorRows = await getAuthorRowsByBookIds(rows.map(row => row.BookID));
    const withAuthors = attachAuthors(rows, authorRows);
    const categoryRows = await getCategoryRowsByBookIds(rows.map(row => row.BookID));
    return attachCategories(withAuthors, categoryRows);
  },

  /**
   * Add a new book record.
   */
  add: async (book) => {
    await db.BeginTrans();
    try {
      await db.execute(`
        INSERT INTO Books_Table (Title, ISBN, Publisher, YearPublished, Language)
        VALUES (?, ?, ?, ?, ?)
      `, [
        book.title,
        book.isbn || '',
        book.publisher || '',
        book.yearPublished || null,
        book.language || 'English'
      ]);

      const bookId = await getInsertedBookId(book.title, book.isbn || '');
      await syncBookAuthors(bookId, book.author);
      await db.CommitTrans();
      return { success: true, BookID: bookId };
    } catch (err) {
      await db.Rollback();
      throw err;
    }
  },

  update: async (id, book) => {
    await db.BeginTrans();
    try {
      await db.execute(`
      UPDATE Books_Table
      SET Title=?, ISBN=?, Publisher=?, YearPublished=?, Language=?
      WHERE BookID=?
    `, [
        book.title,
        book.isbn || '',
        book.publisher || '',
        book.yearPublished || null,
        book.language || 'English',
        id
      ]);

      await syncBookAuthors(id, book.author);
      await db.CommitTrans();
      return { success: true, BookID: id };
    } catch (err) {
      await db.Rollback();
      throw err;
    }
  },

  delete: async (id) => {
    await db.BeginTrans();
    try {
      // Check for active loans for this book (ledger integrity)
      const loanRows = await db.query(`
        SELECT COUNT(*) AS ActiveLoans 
        FROM Loans_Table l
        INNER JOIN BookCopies_Table bc ON l.CopyID = bc.CopyID
        WHERE bc.BookID = ? AND l.LoanStatus = 'Borrowed'
      `, [id]);

      if (loanRows && loanRows.length > 0 && loanRows[0].ActiveLoans > 0) {
        throw new Error('Cannot delete book: ' + loanRows[0].ActiveLoans + ' copy/copies are currently borrowed.');
      }

      await db.execute('DELETE FROM AuthorBooksTable WHERE BookID=?', [id]);
      await db.execute('DELETE FROM BookCategories WHERE BookID=?', [id]);
      await db.execute('DELETE FROM BookCopies_Table WHERE BookID=?', [id]);
      await db.execute('DELETE FROM Books_Table WHERE BookID=?', [id]);
      await db.CommitTrans();
    } catch (err) {
      await db.Rollback();
      throw err;
    }
  },

  // ── BookCategories ──
  addCategory: (bookId, categoryId) =>
    db.execute('INSERT INTO BookCategories (BookID, CategoryID) VALUES (?, ?)', [bookId, categoryId]),

  removeCategory: (bookId, categoryId) =>
    db.execute('DELETE FROM BookCategories WHERE BookID=? AND CategoryID=?', [bookId, categoryId]),

  // ── BookCopies ──
  addCopy: (bookId, accessionNumber, conditionNotes = '') =>
    db.execute(`
      INSERT INTO BookCopies_Table (BookID, AccessionNumber, ConditionNotes, CopyStatus)
      VALUES (?, ?, ?, 'Good')
    `, [bookId, accessionNumber, conditionNotes]),

  /**
   * Get the next accession number for the current year.
   * Format: yyyy-xxxxxxxx (8-char base-36: 0-9 then a-z per digit, starting at 00000000)
   */
  getNextAccessionNumber: async () => {
    const year = new Date().getFullYear();
    const prefix = year + '-';
    const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'; // base 36
    const PAD = 8;

    // Find the highest existing accession number for this year.
    // Sort by Len DESC first so longer suffixes (larger values) come first,
    // then by AccessionNumber DESC for same-length comparison.
    const rows = await db.query(
      `SELECT TOP 1 AccessionNumber FROM BookCopies_Table
       WHERE AccessionNumber LIKE ?
       ORDER BY Len(AccessionNumber) DESC, AccessionNumber DESC`,
      [prefix + '%']
    );

    let nextNum = 0;
    if (rows.length > 0) {
      const suffix = rows[0].AccessionNumber.substring(prefix.length).toLowerCase();
      // Decode base-36 suffix to number
      let val = 0;
      for (let i = 0; i < suffix.length; i++) {
        const charIdx = DIGITS.indexOf(suffix[i]);
        if (charIdx < 0) continue; // skip invalid chars
        val = val * 36 + charIdx;
      }
      nextNum = val + 1;
    }

    // Encode number to base-36 padded to PAD chars
    let encoded = '';
    let n = nextNum;
    for (let i = 0; i < PAD; i++) {
      encoded = DIGITS[n % 36] + encoded;
      n = Math.floor(n / 36);
    }

    return prefix + encoded;
  },

  /**
   * Add multiple copies for a book.
   * Each copy gets CopyStatus='Good', ConditionNotes='New', auto-generated AccessionNumber.
   */
  addCopies: async (bookId, count) => {
    if (!count || count <= 0) return;
    await db.BeginTrans();
    try {
      for (let i = 0; i < count; i++) {
        const accNum = await Books.getNextAccessionNumber();
        await db.execute(
          `INSERT INTO BookCopies_Table (BookID, AccessionNumber, ConditionNotes, CopyStatus)
           VALUES (?, ?, 'New', 'Good')`,
          [bookId, accNum]
        );
      }
      await db.CommitTrans();
    } catch (err) {
      await db.Rollback();
      throw err;
    }
  },

  /**
   * Check if a book with the same Title already exists (optionally exclude a BookID for edits).
   * Returns the duplicate row if found, otherwise null.
   */
  checkDuplicate: async (title, excludeBookId = null) => {
    let sql = `SELECT BookID, Title FROM Books_Table WHERE Title = ?`;
    const params = [title];
    if (excludeBookId) {
      sql += ` AND BookID <> ?`;
      params.push(excludeBookId);
    }
    const rows = await db.query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  },
};

module.exports = Books;
