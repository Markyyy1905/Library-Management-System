/**
 * members.js - Member CRUD operations (3NF schema)
 * Table: Members
 */

const db = require('./db');

const Members = {

  getAll: () => db.query(`
    SELECT
      m.MemberID, m.FirstName, m.LastName, m.Email,
      m.Phone, m.Address, m.DateRegistered, m.Status,
      (SELECT COUNT(*) FROM Loans_Table l WHERE l.MemberID = m.MemberID AND l.LoanStatus = 'Borrowed') AS ActiveLoans,
      (SELECT COUNT(*) FROM Loans_Table l WHERE l.MemberID = m.MemberID) AS TotalBorrows
    FROM Members_Table m
    ORDER BY m.LastName ASC, m.FirstName ASC
  `),

  getById: (id) => db.query(`
    SELECT
      m.MemberID, m.FirstName, m.LastName, m.Email,
      m.Phone, m.Address, m.DateRegistered, m.Status,
      (SELECT COUNT(*) FROM Loans_Table l WHERE l.MemberID = m.MemberID AND l.LoanStatus = 'Borrowed') AS ActiveLoans,
      (SELECT COUNT(*) FROM Loans_Table l WHERE l.MemberID = m.MemberID) AS TotalBorrows
    FROM Members_Table m
    WHERE m.MemberID = ?
  `, [id]),

  search: (keyword) => db.query(`
    SELECT MemberID, FirstName, LastName, Email, Phone, Status
    FROM Members_Table
    WHERE FirstName LIKE ? OR LastName LIKE ? OR Email LIKE ?
    ORDER BY LastName ASC
  `, [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]),

  add: (member) => db.execute(`
    INSERT INTO Members_Table (FirstName, LastName, Email, Phone, Address, DateRegistered, Status)
    VALUES (?, ?, ?, ?, ?, Date(), 'Active')
  `, [
    member.firstName,
    member.lastName,
    member.email || '',
    member.phone || member.phoneNumber || '',
    member.address || ''
  ]),

  update: (id, member) => db.execute(`
    UPDATE Members_Table
    SET FirstName=?, LastName=?, Email=?, Phone=?, Address=?
    WHERE MemberID=?
  `, [
    member.firstName,
    member.lastName,
    member.email || '',
    member.phone || member.phoneNumber || '',
    member.address || '',
    id
  ]),

  updateStatus: (id, status) =>
    db.execute('UPDATE Members_Table SET Status=? WHERE MemberID=?', [status, id]),

  delete: (id) => db.execute('DELETE FROM Members_Table WHERE MemberID=?', [id]),

  getBorrowHistory: (memberId) => db.query(`
    SELECT
      l.LoanID, bk.Title AS BookTitle,
      bc.AccessionNumber,
      l.DateBorrowed, l.DueDate, l.DateReturned, l.LoanStatus
    FROM ((Loans_Table l
      INNER JOIN BookCopies_Table bc ON l.CopyID = bc.CopyID)
      INNER JOIN Books_Table bk ON bc.BookID = bk.BookID)
    WHERE l.MemberID = ?
    ORDER BY l.DateBorrowed DESC
  `, [memberId]),
};

module.exports = Members;
