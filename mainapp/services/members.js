/**
 * members.js - Members CRUD operations
 */

const db = require('./db');

const Members = {
  getAll: () => db.query('SELECT * FROM Members ORDER BY LastName ASC'),

  getById: (id) => db.query(`SELECT * FROM Members WHERE MemberID = ${id}`),

  search: (keyword) =>
    db.query(`SELECT * FROM Members WHERE FirstName LIKE '%${keyword}%' OR LastName LIKE '%${keyword}%' OR Email LIKE '%${keyword}%'`),

  add: (member) =>
    db.execute(
      `INSERT INTO Members (FirstName, LastName, Email, Phone, Address, MembershipDate, Status) 
       VALUES ('${member.firstName}', '${member.lastName}', '${member.email}', '${member.phone}', '${member.address}', Date(), 'Active')`
    ),

  update: (id, member) =>
    db.execute(
      `UPDATE Members SET FirstName='${member.firstName}', LastName='${member.lastName}', 
       Email='${member.email}', Phone='${member.phone}', Address='${member.address}' 
       WHERE MemberID=${id}`
    ),

  updateStatus: (id, status) =>
    db.execute(`UPDATE Members SET Status='${status}' WHERE MemberID = ${id}`),

  delete: (id) => db.execute(`DELETE FROM Members WHERE MemberID = ${id}`),
};

module.exports = Members;
