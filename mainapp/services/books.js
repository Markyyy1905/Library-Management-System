/**
 * books.js - Books CRUD operations
 */

const db = require('./db');

const Books = {
  getAll: () => db.query('SELECT * FROM Books ORDER BY Title ASC'),

  getById: (id) => db.query(`SELECT * FROM Books WHERE BookID = ${id}`),

  search: (keyword) =>
    db.query(`SELECT * FROM Books WHERE Title LIKE '%${keyword}%' OR Author LIKE '%${keyword}%' OR ISBN LIKE '%${keyword}%'`),

  add: (book) =>
    db.execute(
      `INSERT INTO Books (Title, Author, ISBN, Genre, TotalCopies, AvailableCopies, PublishedYear) 
       VALUES ('${book.title}', '${book.author}', '${book.isbn}', '${book.genre}', ${book.totalCopies}, ${book.totalCopies}, ${book.publishedYear})`
    ),

  update: (id, book) =>
    db.execute(
      `UPDATE Books SET Title='${book.title}', Author='${book.author}', ISBN='${book.isbn}', 
       Genre='${book.genre}', TotalCopies=${book.totalCopies}, PublishedYear=${book.publishedYear} 
       WHERE BookID=${id}`
    ),

  delete: (id) => db.execute(`DELETE FROM Books WHERE BookID = ${id}`),

  updateAvailability: (id, delta) =>
    db.execute(`UPDATE Books SET AvailableCopies = AvailableCopies + ${delta} WHERE BookID = ${id}`),
};

module.exports = Books;
