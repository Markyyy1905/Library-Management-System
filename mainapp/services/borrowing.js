/**
 * borrowing.js - Borrowing and Return operations
 */

const db = require('./db');
const Books = require('./books');

const Borrowing = {
  getAll: () =>
    db.query(`
      SELECT b.BorrowID, m.FirstName & ' ' & m.LastName AS MemberName, 
             bk.Title AS BookTitle, b.BorrowDate, b.DueDate, b.ReturnDate, b.Status
      FROM (Borrowings b 
        INNER JOIN Members m ON b.MemberID = m.MemberID)
        INNER JOIN Books bk ON b.BookID = bk.BookID
      ORDER BY b.BorrowDate DESC
    `),

  getActive: () =>
    db.query(`
      SELECT b.BorrowID, m.FirstName & ' ' & m.LastName AS MemberName, m.MemberID,
             bk.Title AS BookTitle, bk.BookID, b.BorrowDate, b.DueDate
      FROM (Borrowings b 
        INNER JOIN Members m ON b.MemberID = m.MemberID)
        INNER JOIN Books bk ON b.BookID = bk.BookID
      WHERE b.Status = 'Borrowed'
      ORDER BY b.DueDate ASC
    `),

  getOverdue: () =>
    db.query(`
      SELECT b.BorrowID, m.FirstName & ' ' & m.LastName AS MemberName, 
             bk.Title AS BookTitle, b.DueDate
      FROM (Borrowings b 
        INNER JOIN Members m ON b.MemberID = m.MemberID)
        INNER JOIN Books bk ON b.BookID = bk.BookID
      WHERE b.Status = 'Borrowed' AND b.DueDate < Date()
      ORDER BY b.DueDate ASC
    `),

  borrow: async (memberId, bookId, dueDays = 14) => {
    await db.execute(
      `INSERT INTO Borrowings (MemberID, BookID, BorrowDate, DueDate, Status) 
       VALUES (${memberId}, ${bookId}, Date(), Date()+${dueDays}, 'Borrowed')`
    );
    await Books.updateAvailability(bookId, -1);
  },

  returnBook: async (borrowId, bookId) => {
    await db.execute(
      `UPDATE Borrowings SET ReturnDate=Date(), Status='Returned' WHERE BorrowID=${borrowId}`
    );
    await Books.updateAvailability(bookId, 1);
  },

  getHistory: (memberId) =>
    db.query(`
      SELECT b.BorrowID, bk.Title, b.BorrowDate, b.DueDate, b.ReturnDate, b.Status
      FROM Borrowings b INNER JOIN Books bk ON b.BookID = bk.BookID
      WHERE b.MemberID = ${memberId}
      ORDER BY b.BorrowDate DESC
    `),
};

module.exports = Borrowing;
