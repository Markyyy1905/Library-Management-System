/**
 * borrowing.js - Loan and Return operations (3NF schema)
 * Tables: Loans, BookCopies, Fines, Members, Books
 */

const db = require('./db');

const Borrowing = {

  /**
   * Lightweight member list for borrow form.
   */
  getBorrowFormMembers: () => db.query(`
    SELECT MemberID, FirstName, LastName
    FROM Members_Table
    WHERE Status = 'Active'
    ORDER BY LastName ASC, FirstName ASC
  `),

  /**
   * Lightweight book list for borrow form.
   */
  getBorrowFormBooks: () => db.query(`
    SELECT b.BookID, b.Title
    FROM Books_Table b
    ORDER BY b.Title ASC
  `),

  /**
   * Search books for the New Loan modal table (search-on-type, max 50 results).
   * Empty search returns top 5 borrowed books that still have available copies.
   */
  getModalBooks: (search = '') => {
    const kw = String(search || '').trim();

    if (!kw) {
      return db.query(`
        SELECT TOP 5 bk.BookID, bk.Title, bk.Author, bk.ISBN, bk.YearPublished, bk.Publisher,
          COUNT(l.LoanID) AS TotalBorrows,
          (SELECT COUNT(*) FROM BookCopies_Table bc2
            WHERE bc2.BookID = bk.BookID
              AND bc2.CopyID NOT IN (
                SELECT l2.CopyID FROM Loans_Table l2 WHERE l2.LoanStatus = 'Borrowed'
              )
          ) AS AvailableCopies
        FROM (Books_Table bk
          INNER JOIN BookCopies_Table bc ON bk.BookID = bc.BookID)
          INNER JOIN Loans_Table l ON bc.CopyID = l.CopyID
        GROUP BY bk.BookID, bk.Title, bk.Author, bk.ISBN, bk.YearPublished, bk.Publisher
        HAVING (SELECT COUNT(*) FROM BookCopies_Table bc3
                  WHERE bc3.BookID = bk.BookID
                    AND bc3.CopyID NOT IN (
                      SELECT l3.CopyID FROM Loans_Table l3 WHERE l3.LoanStatus = 'Borrowed'
                    )) > 0
        ORDER BY COUNT(l.LoanID) DESC
      `);
    }

    if (kw.length < 2) return Promise.resolve([]);

    return db.query(
      `SELECT TOP 50 b.BookID, b.Title, b.Author, b.ISBN, b.YearPublished, b.Publisher,
         (SELECT COUNT(*) FROM BookCopies_Table bc WHERE bc.BookID = b.BookID
            AND bc.CopyID NOT IN (SELECT l.CopyID FROM Loans_Table l WHERE l.LoanStatus = 'Borrowed')
         ) AS AvailableCopies
       FROM Books_Table b
       WHERE b.Title LIKE ? OR b.Author LIKE ? OR b.ISBN LIKE ?
       ORDER BY b.Title ASC`,
      [`%${kw}%`, `%${kw}%`, `%${kw}%`]
    );
  },

  /**
   * All loans with member name, book title, accession number.
   */
  getAll: () => db.query(`
    SELECT
      TOP 1000
      l.LoanID,
      m.FirstName & ' ' & m.LastName AS MemberName,
      m.MemberID,
      bk.Title AS BookTitle,
      bk.BookID,
      bc.CopyID,
      bc.AccessionNumber,
      bc.CopyStatus,
      bc.ConditionNotes,
      l.DateBorrowed,
      l.DueDate,
      l.DateReturned,
      l.LoanStatus,
      u.FirstName & ' ' & u.LastName AS IssuedByName
    FROM (((Loans_Table l
      INNER JOIN Members_Table m ON l.MemberID = m.MemberID)
      INNER JOIN BookCopies_Table bc ON l.CopyID = bc.CopyID)
      INNER JOIN Books_Table bk ON bc.BookID = bk.BookID)
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
    FROM ((Loans_Table l
      INNER JOIN Members_Table m ON l.MemberID = m.MemberID)
      INNER JOIN BookCopies_Table bc ON l.CopyID = bc.CopyID)
      INNER JOIN Books_Table bk ON bc.BookID = bk.BookID
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
    FROM ((Loans_Table l
      INNER JOIN Members_Table m ON l.MemberID = m.MemberID)
      INNER JOIN BookCopies_Table bc ON l.CopyID = bc.CopyID)
      INNER JOIN Books_Table bk ON bc.BookID = bk.BookID
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
    FROM ((Loans_Table l
      INNER JOIN Members_Table m ON l.MemberID = m.MemberID)
      INNER JOIN BookCopies_Table bc ON l.CopyID = bc.CopyID)
      INNER JOIN Books_Table bk ON bc.BookID = bk.BookID
    WHERE l.LoanStatus = 'Returned'
    ORDER BY l.DateReturned DESC
  `),

  getById: (loanId) => db.query(`
    SELECT
      l.LoanID, l.MemberID, l.CopyID, l.IssuedBy,
      l.DateBorrowed, l.DueDate, l.DateReturned, l.LoanStatus,
      m.FirstName & ' ' & m.LastName AS MemberName, m.Email,
      bk.Title AS BookTitle, bk.BookID,
      bc.AccessionNumber
    FROM (((Loans_Table l
      INNER JOIN Members_Table m ON l.MemberID = m.MemberID)
      INNER JOIN BookCopies_Table bc ON l.CopyID = bc.CopyID)
      INNER JOIN Books_Table bk ON bc.BookID = bk.BookID)
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
    try {
      await db.BeginTrans();
      await db.execute(`
        INSERT INTO Loans_Table (MemberID, CopyID, IssuedBy, DateBorrowed, DueDate, LoanStatus)
        VALUES (?, ?, ?, Date(), DateAdd('d', ?, Date()), 'Borrowed')
      `, [memberId, copyId, issuedBy, dueDays]);

      // A loan inherently marks the copy as borrowed (via dynamic querying)
      await db.CommitTrans();
    } catch (err) {
      await db.Rollback();
      throw err;
    }
  },

  /**
   * Process a return. Updates loan + copy status. Notes are only updated when provided.
   * @param {number} loanId
   * @param {number} copyId
   * @param {string} conditionStatus - new CopyStatus for the copy
   * @param {string} conditionNotes  - optional new ConditionNotes for the copy
   */
  returnBook: async (loanId, copyId, conditionStatus = '', conditionNotes = '') => {
    try {
      await db.BeginTrans();

      const copyRows = await db.query(`
        SELECT CopyStatus, ConditionNotes
        FROM BookCopies_Table
        WHERE CopyID = ?
      `, [copyId]);

      if (!copyRows.length) {
        throw new Error('Book copy not found.');
      }

      const currentStatus = String(copyRows[0].CopyStatus || 'Good');
      const requestedStatus = String(conditionStatus || currentStatus);
      const allowedTransitions = {
        Good: ['Good', 'Fair', 'Damaged'],
        Fair: ['Fair', 'Damaged'],
        Damaged: ['Damaged'],
      };

      if (!allowedTransitions[currentStatus] || !allowedTransitions[currentStatus].includes(requestedStatus)) {
        throw new Error(`Invalid copy condition change. Current status is ${currentStatus}.`);
      }

      // Mark loan returned
      await db.execute(`
        UPDATE Loans_Table SET DateReturned=Date(), LoanStatus='Returned' WHERE LoanID=?
      `, [loanId]);

      if (String(conditionNotes || '').trim()) {
        await db.execute(
          `UPDATE BookCopies_Table
           SET CopyStatus=?, ConditionNotes=?
           WHERE CopyID=?`,
          [requestedStatus, conditionNotes.trim(), copyId]
        );
      } else {
        await db.execute(
          `UPDATE BookCopies_Table
           SET CopyStatus=?
           WHERE CopyID=?`,
          [requestedStatus, copyId]
        );
      }

      await db.CommitTrans();
    } catch (err) {
      await db.Rollback();
      throw err;
    }
  },



  /**
   * Get available (not currently borrowed) copies for a specific book.
   */
  getAvailableCopiesByBook: (bookId, search = '', limit = 200) => {
    const cappedLimit = Math.max(1, Math.min(Number(limit) || 200, 500));
    const keyword = String(search || '').trim();

    if (keyword) {
      return db.query(`
        SELECT TOP ${cappedLimit} bc.CopyID, bc.AccessionNumber, bc.ConditionNotes
        FROM BookCopies_Table bc
        WHERE bc.BookID = ?
          AND bc.AccessionNumber LIKE ?
          AND bc.CopyID NOT IN (
            SELECT l.CopyID FROM Loans_Table l WHERE l.LoanStatus = 'Borrowed'
          )
        ORDER BY bc.AccessionNumber ASC
      `, [bookId, `%${keyword}%`]);
    }

    return db.query(`
      SELECT TOP ${cappedLimit} bc.CopyID, bc.AccessionNumber, bc.ConditionNotes
      FROM BookCopies_Table bc
      WHERE bc.BookID = ?
        AND bc.CopyID NOT IN (
          SELECT l.CopyID FROM Loans_Table l WHERE l.LoanStatus = 'Borrowed'
        )
      ORDER BY bc.AccessionNumber ASC
    `, [bookId]);
  },

  // ── Reservations ──
  getReservations: () => db.query(`
    SELECT
      r.ReservationID,
      m.FirstName & ' ' & m.LastName AS MemberName,
      bk.Title AS BookTitle,
      r.ReservationDate, r.ExpirationDate, r.ReservationStatus
    FROM (Reservations r
      INNER JOIN Members_Table m ON r.MemberID = m.MemberID)
      INNER JOIN Books_Table bk ON r.BookID = bk.BookID
    WHERE r.ReservationStatus = 'Pending'
    ORDER BY r.ReservationDate ASC
  `),

  addReservation: (bookId, memberId) => db.execute(`
    INSERT INTO Reservations (BookID, MemberID, ReservationDate, ReservationStatus, ExpirationDate)
    VALUES (?, ?, Date(), 'Pending', DateAdd('d', 7, Date()))
  `, [bookId, memberId]),
};

module.exports = Borrowing;
