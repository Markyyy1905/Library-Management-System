/**
 * books.js - Book CRUD operations (3NF schema)
 * Tables: Books, BookAuthors, BookCategories, BookCopies, Authors, Categories, Publishers
 */

const db = require('./db');

const Books = {

  /**
   * Full book list with author names, categories, publisher, and copy counts.
   */
  getAll: () => db.query(`
    SELECT
      b.BookID,
      b.Title,
      b.Author,
      b.ISBN,
      b.YearPublished,
      b.Language,
      b.Publisher,
      (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID) AS TotalCopies,
      (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID AND bc.CopyID NOT IN (SELECT CopyID FROM Loans_Table l WHERE l.LoanStatus = 'Borrowed')) AS AvailableCopies
    FROM Books_Table b
    ORDER BY b.Title ASC
  `),

  getById: (id) => db.query(`
      SELECT
        b.BookID, b.Title, b.Author, b.ISBN, b.YearPublished,
        b.Language, b.Publisher,
        (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID) AS TotalCopies,
        (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID AND bc.CopyID NOT IN (SELECT CopyID FROM Loans_Table l WHERE l.LoanStatus = 'Borrowed')) AS AvailableCopies
      FROM Books_Table b
      WHERE b.BookID = ?
    `, [id]),

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

  search: (keyword) => db.query(`
      SELECT
        b.BookID, b.Title, b.Author, b.ISBN, b.YearPublished,
        b.Publisher,
        (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID) AS TotalCopies,
        (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID AND bc.CopyID NOT IN (SELECT CopyID FROM Loans_Table l WHERE l.LoanStatus = 'Borrowed')) AS AvailableCopies
      FROM Books_Table b
      WHERE b.Title LIKE ? OR b.Author LIKE ? OR b.ISBN LIKE ?
      ORDER BY b.Title ASC
    `, [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]),

  /**
   * Add a new book record.
   */
  add: (book) => db.execute(`
      INSERT INTO Books_Table (Title, Author, ISBN, Publisher, YearPublished, Language)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      book.title,
      book.author || '',
      book.isbn || '',
      book.publisher || '',
      book.yearPublished || null,
      book.language || 'English'
    ]),

  update: (id, book) => db.execute(`
      UPDATE Books_Table
      SET Title=?, Author=?, ISBN=?, Publisher=?, YearPublished=?, Language=?
      WHERE BookID=?
    `, [
      book.title,
      book.author || '',
      book.isbn || '',
      book.publisher || '',
      book.yearPublished || null,
      book.language || 'English',
      id
    ]),

  delete: async (id) => {
    await db.BeginTrans();
    try {
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
