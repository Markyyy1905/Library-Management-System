/**
 * borrowing.js - Loan and Return operations (3NF schema)
 * Tables: Loans, BookCopies, Fines, Members, Books
 */

const db = require('./db');

const Borrowing = {

  /**
   * All loans with member name, book title, accession number.
   */
  getAll: () => db.query(`
    SELECT
      l.LoanID,
      m.FirstName & ' ' & m.LastName AS MemberName,
      m.MemberID,
      bk.Title AS BookTitle,
      bk.BookID,
      bc.CopyID,
      bc.AccessionNumber,
      l.DateBorrowed,
      l.DueDate,
      l.DateReturned,
      l.LoanStatus,
      u.FirstName & ' ' & u.LastName AS IssuedByName
    FROM (((Loans l
      INNER JOIN Members m ON l.MemberID = m.MemberID)
      INNER JOIN BookCopies bc ON l.CopyID = bc.CopyID)
      INNER JOIN Books bk ON bc.BookID = bk.BookID)
      LEFT JOIN Users_Table u ON l.IssuedBy = u.UserID
    ORDER BY l.DateBorrowed DESC
  `),

  getActive: () => db.query(`
    SELECT
      l.LoanID,
      m.FirstName & ' ' & m.LastName AS MemberName,
      m.MemberID,
      bk.Title AS BookTitle,
      bk.BookID,
      bc.CopyID,
      bc.AccessionNumber,
      l.DateBorrowed,
      l.DueDate
    FROM ((Loans l
      INNER JOIN Members m ON l.MemberID = m.MemberID)
      INNER JOIN BookCopies bc ON l.CopyID = bc.CopyID)
      INNER JOIN Books bk ON bc.BookID = bk.BookID
    WHERE l.LoanStatus = 'Borrowed'
    ORDER BY l.DueDate ASC
  `),

  getOverdue: () => db.query(`
    SELECT
      l.LoanID,
      m.FirstName & ' ' & m.LastName AS MemberName,
      m.MemberID, m.Email,
      bk.Title AS BookTitle,
      bc.AccessionNumber,
      l.DueDate,
      DateDiff('d', l.DueDate, Date()) AS DaysOverdue
    FROM ((Loans l
      INNER JOIN Members m ON l.MemberID = m.MemberID)
      INNER JOIN BookCopies bc ON l.CopyID = bc.CopyID)
      INNER JOIN Books bk ON bc.BookID = bk.BookID
    WHERE l.LoanStatus = 'Borrowed' AND l.DueDate < Date()
    ORDER BY l.DueDate ASC
  `),

  getReturned: () => db.query(`
    SELECT
      l.LoanID,
      m.FirstName & ' ' & m.LastName AS MemberName,
      bk.Title AS BookTitle,
      bc.AccessionNumber,
      l.DateBorrowed, l.DueDate, l.DateReturned
    FROM ((Loans l
      INNER JOIN Members m ON l.MemberID = m.MemberID)
      INNER JOIN BookCopies bc ON l.CopyID = bc.CopyID)
      INNER JOIN Books bk ON bc.BookID = bk.BookID
    WHERE l.LoanStatus = 'Returned'
    ORDER BY l.DateReturned DESC
  `),

  getById: (loanId) => db.query(`
    SELECT
      l.LoanID, l.MemberID, l.CopyID, l.IssuedBy,
      l.DateBorrowed, l.DueDate, l.DateReturned, l.LoanStatus,
      m.FirstName & ' ' & m.LastName AS MemberName, m.Email,
      bk.Title AS BookTitle, bk.BookID,
      bc.AccessionNumber,
      f.FineID, f.FineAmount, f.FineStatus
    FROM (((Loans l
      INNER JOIN Members m ON l.MemberID = m.MemberID)
      INNER JOIN BookCopies bc ON l.CopyID = bc.CopyID)
      INNER JOIN Books bk ON bc.BookID = bk.BookID)
      LEFT JOIN Fines f ON f.LoanID = l.LoanID
    WHERE l.LoanID = ?
  `, [loanId]),

  /**
   * Issue a loan. Marks copy as Borrowed.
   * @param {number} memberId
   * @param {number} copyId      - BookCopies.CopyID (specific physical copy)
   * @param {number} issuedBy    - Users.UserID of librarian
   * @param {number} dueDays
   */
  borrow: async (memberId, copyId, issuedBy, dueDays = 14) => {
    await db.execute(`
      INSERT INTO Loans (MemberID, CopyID, IssuedBy, DateBorrowed, DueDate, LoanStatus)
      VALUES (?, ?, ?, Date(), DateAdd('d', ?, Date()), 'Borrowed')
    `, [memberId, copyId, issuedBy, dueDays]);

    await db.execute(
      "UPDATE BookCopies SET CopyStatus='Borrowed' WHERE CopyID=?",
      [copyId]
    );
  },

  /**
   * Process a return. Updates loan + copy status. Creates fine if overdue.
   * @param {number} loanId
   * @param {number} copyId
   * @param {string} condition  - new ConditionNotes for the copy
   */
  returnBook: async (loanId, copyId, condition = '') => {
    // Mark loan returned
    await db.execute(`
      UPDATE Loans SET DateReturned=Date(), LoanStatus='Returned' WHERE LoanID=?
    `, [loanId]);

    // Restore copy to Available
    await db.execute(
      "UPDATE BookCopies SET CopyStatus='Available', ConditionNotes=? WHERE CopyID=?",
      [condition, copyId]
    );

    // Check if overdue and auto-create fine (₱5/day example rate)
    const rows = await db.query(`
      SELECT DateDiff('d', DueDate, Date()) AS DaysLate
      FROM Loans WHERE LoanID=? AND DueDate < Date()
    `, [loanId]);

    if (rows.length && rows[0].DaysLate > 0) {
      const fineAmount = rows[0].DaysLate * 5; // configurable rate
      await db.execute(`
        INSERT INTO Fines (LoanID, FineAmount, FineStatus, DateIssued)
        VALUES (?, ?, 'Unpaid', Date())
      `, [loanId, fineAmount]);
    }
  },

  // ── Fines ──
  payFine: (fineId) =>
    db.execute("UPDATE Fines SET FineStatus='Paid', DatePaid=Date() WHERE FineID=?", [fineId]),

  waiveFine: (fineId) =>
    db.execute("UPDATE Fines SET FineStatus='Waived' WHERE FineID=?", [fineId]),

  getFinesByMember: (memberId) => db.query(`
    SELECT f.FineID, f.FineAmount, f.FineStatus, f.DateIssued, f.DatePaid,
           bk.Title AS BookTitle, l.DueDate, l.DateReturned
    FROM (Fines f
      INNER JOIN Loans l ON f.LoanID = l.LoanID)
      INNER JOIN BookCopies bc ON l.CopyID = bc.CopyID
      INNER JOIN Books bk ON bc.BookID = bk.BookID
    WHERE l.MemberID = ?
    ORDER BY f.DateIssued DESC
  `, [memberId]),

  // ── Reservations ──
  getReservations: () => db.query(`
    SELECT
      r.ReservationID,
      m.FirstName & ' ' & m.LastName AS MemberName,
      bk.Title AS BookTitle,
      r.ReservationDate, r.ExpirationDate, r.ReservationStatus
    FROM (Reservations r
      INNER JOIN Members m ON r.MemberID = m.MemberID)
      INNER JOIN Books bk ON r.BookID = bk.BookID
    WHERE r.ReservationStatus = 'Pending'
    ORDER BY r.ReservationDate ASC
  `),

  addReservation: (bookId, memberId) => db.execute(`
    INSERT INTO Reservations (BookID, MemberID, ReservationDate, ReservationStatus, ExpirationDate)
    VALUES (?, ?, Date(), 'Pending', DateAdd('d', 7, Date()))
  `, [bookId, memberId]),
};

module.exports = Borrowing;
