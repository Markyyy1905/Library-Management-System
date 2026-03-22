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

  delete: (id) => db.execute('DELETE FROM Books_Table WHERE BookID=?', [id]),

  // ── BookCategories ──
  addCategory: (bookId, categoryId) =>
    db.execute('INSERT INTO BookCategories (BookID, CategoryID) VALUES (?, ?)', [bookId, categoryId]),

  removeCategory: (bookId, categoryId) =>
    db.execute('DELETE FROM BookCategories WHERE BookID=? AND CategoryID=?', [bookId, categoryId]),

  // ── BookCopies ──
  addCopy: (bookId, accessionNumber, conditionNotes = '') =>
    db.execute(`
      INSERT INTO BookCopies_Table (BookID, AccessionNumber, ConditionNotes)
      VALUES (?, ?, ?)
    `, [bookId, accessionNumber, conditionNotes]),
};

module.exports = Books;
