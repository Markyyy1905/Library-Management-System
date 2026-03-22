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
      b.ISBN,
      b.YearPublished,
      b.Edition,
      b.Language,
      b.BookDescription,
      p.PublisherName,
      (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID) AS TotalCopies,
      (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID AND bc.CopyStatus = 'Available') AS AvailableCopies
    FROM (Books_Table b LEFT JOIN Publishers_Table p ON b.PublisherID = p.PublisherID)
    ORDER BY b.Title ASC
  `),

  getById: (id) => db.query(`
    SELECT
      b.BookID, b.Title, b.ISBN, b.YearPublished, b.Edition,
      b.Language, b.BookDescription, b.PublisherID,
      p.PublisherName,
      (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID) AS TotalCopies,
      (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID AND bc.CopyStatus = 'Available') AS AvailableCopies
    FROM (Books_Table b LEFT JOIN Publishers_Table p ON b.PublisherID = p.PublisherID)
    WHERE b.BookID = ?
  `, [id]),

  /**
   * Authors for a book (from BookAuthors junction).
   */
  getAuthors: (bookId) => db.query(`
    SELECT a.AuthorID, a.AuthorName, a.AuthorCountry
    FROM BookAuthors_Table ba INNER JOIN Authors_Table a ON ba.AuthorID = a.AuthorID
    WHERE ba.BookID = ?
  `, [bookId]),

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
    SELECT CopyID, AccessionNumber, CopyStatus, DateAdded, ConditionNotes
    FROM BookCopies_Table
    WHERE BookID = ?
    ORDER BY AccessionNumber ASC
  `, [bookId]),

  search: (keyword) => db.query(`
    SELECT
      b.BookID, b.Title, b.ISBN, b.YearPublished,
      p.PublisherName,
      (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID) AS TotalCopies,
      (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID AND bc.CopyStatus = 'Available') AS AvailableCopies
    FROM (Books_Table b LEFT JOIN Publishers_Table p ON b.PublisherID = p.PublisherID)
    WHERE b.Title LIKE ? OR b.ISBN LIKE ?
    ORDER BY b.Title ASC
  `, [`%${keyword}%`, `%${keyword}%`]),

  /**
   * Add a new book record.
   */
  add: (book) => db.execute(`
    INSERT INTO Books_Table (Title, ISBN, PublisherID, YearPublished, Edition, Language, BookDescription)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    book.title,
    book.isbn || '',
    book.publisherId || null,
    book.yearPublished || null,
    book.edition || '',
    book.language || 'English',
    book.description || ''
  ]),

  update: (id, book) => db.execute(`
    UPDATE Books_Table
    SET Title=?, ISBN=?, PublisherID=?, YearPublished=?, Edition=?, Language=?, BookDescription=?
    WHERE BookID=?
  `, [
    book.title,
    book.isbn || '',
    book.publisherId || null,
    book.yearPublished || null,
    book.edition || '',
    book.language || 'English',
    book.description || '',
    id
  ]),

  delete: (id) => db.execute('DELETE FROM Books_Table WHERE BookID=?', [id]),

  // ── BookAuthors ──
  addAuthor: (bookId, authorId) =>
    db.execute('INSERT INTO BookAuthors_Table (BookID, AuthorID) VALUES (?, ?)', [bookId, authorId]),

  removeAuthor: (bookId, authorId) =>
    db.execute('DELETE FROM BookAuthors_Table WHERE BookID=? AND AuthorID=?', [bookId, authorId]),

  // ── BookCategories ──
  addCategory: (bookId, categoryId) =>
    db.execute('INSERT INTO BookCategories (BookID, CategoryID) VALUES (?, ?)', [bookId, categoryId]),

  removeCategory: (bookId, categoryId) =>
    db.execute('DELETE FROM BookCategories WHERE BookID=? AND CategoryID=?', [bookId, categoryId]),

  // ── BookCopies ──
  addCopy: (bookId, accessionNumber, conditionNotes = '') =>
    db.execute(`
      INSERT INTO BookCopies_Table (BookID, AccessionNumber, CopyStatus, DateAdded, ConditionNotes)
      VALUES (?, ?, 'Available', Date(), ?)
    `, [bookId, accessionNumber, conditionNotes]),

  updateCopyStatus: (copyId, status) =>
    db.execute('UPDATE BookCopies_Table SET CopyStatus=? WHERE CopyID=?', [status, copyId]),
};

module.exports = Books;
