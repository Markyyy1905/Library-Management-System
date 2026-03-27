# LMS — Implementation Reference

Detailed evidence of every database and application concept used in the Library Management System, with direct links to the relevant source lines.

---

## Table of Contents

1. [Advanced Querying & Relationships](#1-advanced-querying--relationships)
   - [Filtering Logic](#11-filtering-logic)
   - [Relational Joins](#12-relational-joins)
   - [Complex Queries — Subqueries & Nested SELECTs](#13-complex-queries--subqueries--nested-selects)
2. [Advanced Database Objects](#2-advanced-database-objects)
   - [Set Operators](#21-set-operators)
   - [Views](#22-views)
   - [Integrity Constraints](#23-integrity-constraints)
3. [Professional Management & Optimization](#3-professional-management--optimization)
   - [Transactions — BeginTrans / CommitTrans / Rollback](#31-transactions--begintrans--committrans--rollback)
   - [Performance — Indexing Strategy](#32-performance--indexing-strategy)
   - [Logic & Automation — Action Queries & Built-in Functions](#33-logic--automation--action-queries--built-in-functions)
   - [Security — User Management & UI Privileges](#34-security--user-management--ui-privileges)
   - [Maintenance — Backup & Recovery](#35-maintenance--backup--recovery)

---

## 1. Advanced Querying & Relationships

### 1.1 Filtering Logic

#### `DISTINCT`

Used to remove duplicate rows when searching books across the author join table, since a single book can have multiple authors and would otherwise appear more than once.

| File | Line | Usage |
|------|------|-------|
| [`mainapp/services/books.js`](mainapp/services/books.js#L281) | L281 | `DISTINCT` in book search query to collapse duplicates from the author join |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L104) | L104 | `SELECT DISTINCT TOP 50` in modal book search |

#### `IN`

Used to filter rows whose ID appears in a set. Also used with a negative form (`NOT IN`) to find copies not currently borrowed.

| File | Line | Usage |
|------|------|-------|
| [`mainapp/services/books.js`](mainapp/services/books.js#L47) | L47 | `WHERE ab.BookID IN (…)` — batched author lookup |
| [`mainapp/services/books.js`](mainapp/services/books.js#L94) | L94 | `WHERE bc.BookID IN (…)` — batched category lookup |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L21) | L21 | `WHERE ab.BookID IN (…)` — same pattern in borrowing |
| [`mainapp/services/books.js`](mainapp/services/books.js#L218) | L218 | `bc.CopyID NOT IN (SELECT CopyID …)` — available copy count |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L81) | L81 | `bc2.CopyID NOT IN (…)` — availability in modal (empty-search path) |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L106) | L106 | `bc.CopyID NOT IN (…)` — availability in modal (keyword-search path) |
| [`main.js`](main.js#L452) | L452 | Dashboard available-copy count via `NOT IN` subquery |

#### `NULL` Handling

NULL values are handled at two levels: in the SQL where nullable columns require special comparison syntax, and in the query builder where JavaScript `null`/`undefined` must be converted to the SQL literal `NULL`.

| File | Line | Usage |
|------|------|-------|
| [`mainapp/services/books.js`](mainapp/services/books.js#L192) | L192 | `(ISBN IS NULL AND ? IS NULL) OR ISBN = ?` — nullable ISBN in duplicate check |
| [`mainapp/services/books.js`](mainapp/services/books.js#L270) | L270 | `IIF(l.LoanID IS NULL, 'Available', 'Borrowed')` — copy status derived from NULL loan |
| [`mainapp/services/db.js`](mainapp/services/db.js#L106) | L106 | `val = 'NULL'` — JavaScript `null`/`undefined` mapped to SQL `NULL` in the query builder |

#### `BETWEEN`

Date-range comparisons are present as direct `<` / `>` conditions. For example, overdue detection uses `l.DueDate < Date()` at [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L181). A formal `BETWEEN` clause is not used in the current query set.

---

### 1.2 Relational Joins

#### `INNER JOIN`

Mandatory relationships are expressed as INNER JOINs so only rows with matching records on both sides are returned.

| File | Lines | Tables Joined |
|------|-------|---------------|
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L141) | L141–L144 | `Loans ⟶ Members`, `Loans ⟶ BookCopies`, `BookCopies ⟶ Books`, `Loans ⟶ Users (LEFT)` |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L160) | L160–L162 | Active loans: `Loans ⟶ Members ⟶ BookCopies ⟶ Books` |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L177) | L177–L179 | Overdue loans: same four-table chain |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L192) | L192–L194 | Returned loans chain |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L207) | L207–L209 | Loan detail by ID chain |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L86) | L86–L87 | `Books ⟶ BookCopies ⟶ Loans` for top-borrowed book ranking |
| [`mainapp/services/books.js`](mainapp/services/books.js#L253) | L253 | `BookCategories ⟶ Categories_Table` (detail) |
| [`mainapp/services/books.js`](mainapp/services/books.js#L92) | L92 | `BookCategories ⟶ Categories_Table` (batched) |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L338) | L338–L339 | `Reservations ⟶ Members`, `Reservations ⟶ Books` |
| [`main.js`](main.js#L234) | L234–L236 | Dashboard recent loans: `Loans ⟶ Members ⟶ BookCopies ⟶ Books` |
| [`main.js`](main.js#L245) | L245–L246 | Dashboard top books: `Loans ⟶ BookCopies ⟶ Books` |
| [`mainapp/services/members.js`](mainapp/services/members.js#L162) | L162–L163 | Member borrow history: `Loans ⟶ BookCopies ⟶ Books` |

#### `LEFT JOIN`

Optional relationships use LEFT JOINs so the primary row is always returned even when no matching row exists on the right side.

| File | Line | Purpose |
|------|------|---------|
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L144) | L144 | `LEFT JOIN Users_Table` — loans where IssuedBy may be null |
| [`mainapp/services/books.js`](mainapp/services/books.js#L287) | L287–L288 | `LEFT JOIN AuthorBooksTable / AuthorsTable` — books that may have no author entry |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L109) | L109–L110 | Same author left-join pattern in the modal keyword search |
| [`mainapp/services/lookup.js`](mainapp/services/lookup.js#L156) | L156 | `LEFT JOIN Users_Table` — audit log entries where user may have been deleted |
| [`mainapp/services/books.js`](mainapp/services/books.js#L272) | L272 | `LEFT JOIN Loans_Table` — copies, showing Available when no matching loan exists |

#### `RIGHT JOIN`

Not used. All outer-join relationships are expressed with LEFT JOINs by placing the optional table on the right side.

---

### 1.3 Complex Queries — Subqueries & Nested SELECTs

Correlated and non-correlated subqueries are used extensively for per-row aggregate counts and availability checks without requiring a separate round-trip to the database.

| File | Lines | What It Computes |
|------|-------|-----------------|
| [`mainapp/services/books.js`](mainapp/services/books.js#L217) | L217–L218 | Per-book `TotalCopies` and `AvailableCopies` as scalar subqueries inside `getAll` |
| [`mainapp/services/books.js`](mainapp/services/books.js#L234) | L234–L235 | Same pair of subqueries inside `getById` |
| [`mainapp/services/books.js`](mainapp/services/books.js#L284) | L284–L285 | Same pair inside book `search` |
| [`mainapp/services/members.js`](mainapp/services/members.js#L19) | L19–L20 | Per-member `ActiveLoans` and `TotalBorrows` as scalar subqueries |
| [`mainapp/services/members.js`](mainapp/services/members.js#L29) | L29–L30 | Same pair in `getById` |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L79) | L79–L82 | Nested `COUNT(*)` subquery for available copies in top-borrowed ranking |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L89) | L89–L92 | `HAVING` clause built around a `COUNT(*)` subquery |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L105) | L105–L107 | Scalar availability subquery in modal keyword search |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L311) | L311–L314 | `NOT IN` subquery inside `getAvailableCopiesByBook` (keyword path) |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L322) | L322–L325 | Same `NOT IN` subquery (no-keyword path) |
| [`main.js`](main.js#L208) | L208 | Dashboard available-copy count via nested `NOT IN` subquery |

---

## 2. Advanced Database Objects

### 2.1 Set Operators

#### `UNION`

Not implemented as an explicit `UNION` keyword. Combined result sets are composed in JavaScript by fetching and merging arrays before rendering.

#### `INTERSECT` / `EXCEPT` (join-based workarounds)

Access Jet/ACE SQL does not support `INTERSECT` or `EXCEPT` natively. The equivalent logic is achieved using:

- **INTERSECT equivalent** — `INNER JOIN` between two sets that must both match, e.g. finding books that are both borrowed and have active reservations.
- **EXCEPT equivalent** — `NOT IN (subquery)` pattern, applied throughout the codebase to find copies that do *not* appear in the active loans list.

| File | Line | Equivalent |
|------|------|-----------|
| [`mainapp/services/books.js`](mainapp/services/books.js#L218) | L218 | `NOT IN` as EXCEPT — copies excluded from available count |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L81) | L81 | `NOT IN` as EXCEPT — unavailable copies excluded from top-borrowed query |
| [`main.js`](main.js#L452) | L452 | `NOT IN` as EXCEPT — dashboard available copy count |

---

### 2.2 Views

Formal `CREATE VIEW` objects are not defined as named database objects in source. Query-level equivalents are built through:

- **Parameterised service functions** that encapsulate complex SQL and are called by name, acting as virtual views — e.g. `Books.getAll()` in [`mainapp/services/books.js`](mainapp/services/books.js#L165), `Borrowing.getAll()` in [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L138).
- **IPC handler delegation** in [`main.js`](main.js#L253) where the renderer calls a named channel instead of writing raw SQL.

---

### 2.3 Integrity Constraints

Constraints (`PRIMARY KEY`, `FOREIGN KEY`, `CHECK`, `UNIQUE`) are defined inside the Access database file (`mainapp/data/LMS.accdb`) through the Access table designer, not in plain-text DDL files. Their presence is inferred from:

- The relational schema in [`schema.txt`](schema.txt) which lists every table and its columns including primary ID fields (`BookID`, `CopyID`, `MemberID`, `LoanID`, `UserID`, etc.).
- Application-level enforcement where needed:
  - **UNIQUE:** duplicate title check before insert/update in [`mainapp/services/books.js`](mainapp/services/books.js#L446) and called from [`mainapp/books.html`](mainapp/books.html#L444).
  - **UNIQUE:** duplicate username check in [`mainapp/services/auth.js`](mainapp/services/auth.js#L118) and [`mainapp/services/members.js`](mainapp/services/members.js#L54).
  - **CHECK (status transitions):** copy condition can only degrade — `Good → Fair → Damaged` — enforced in [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L256).

---

## 3. Professional Management & Optimization

### 3.1 Transactions — BeginTrans / CommitTrans / Rollback

The database module exposes three transaction methods that wrap the ODBC connection's native `beginTransaction`, `commit`, and `rollback`.

**Transaction wrappers in db.js:**

| File | Lines | Method |
|------|-------|--------|
| [`mainapp/services/db.js`](mainapp/services/db.js#L143) | L143–L146 | `BeginTrans()` — starts a transaction on the singleton connection |
| [`mainapp/services/db.js`](mainapp/services/db.js#L148) | L148–L151 | `CommitTrans()` — commits all statements in the current transaction |
| [`mainapp/services/db.js`](mainapp/services/db.js#L153) | L153–L156 | `Rollback()` — rolls back on any error |

**Used in multi-step operations:**

| File | Lines | Operation Protected |
|------|-------|---------------------|
| [`mainapp/services/books.js`](mainapp/services/books.js#L301) | L301–L317 | `Books.add` — INSERT book + sync authors |
| [`mainapp/services/books.js`](mainapp/services/books.js#L325) | L325–L343 | `Books.update` — UPDATE book + re-sync authors |
| [`mainapp/services/books.js`](mainapp/services/books.js#L351) | L351–L360 | `Books.delete` — DELETE authors, categories, copies, then book |
| [`mainapp/services/books.js`](mainapp/services/books.js#L427) | L427–L441 | `Books.addCopies` — loop-INSERT multiple copies atomically |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L222) | L222–L231 | `Borrowing.borrow` — INSERT loan record |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L245) | L245–L292 | `Borrowing.returnBook` — UPDATE loan + UPDATE copy status |
| [`mainapp/services/members.js`](mainapp/services/members.js#L62) | L62–L98 | `Members.add` — INSERT user account + INSERT member record |
| [`mainapp/services/members.js`](mainapp/services/members.js#L143) | L143–L164 | `Members.delete` — DELETE user + DELETE member |
| [`mainapp/services/auth.js`](mainapp/services/auth.js#L117) | L117–L185 | `Auth.register` — INSERT user + optional INSERT member |

---

### 3.2 Performance — Indexing Strategy

Indexes are created automatically at startup via the `ensureIndexes` routine in the database module. Each `CREATE INDEX` is wrapped in a try/catch so the app starts normally even if an index already exists.

**Index definitions:**

| File | Lines | Indexes Created |
|------|-------|-----------------|
| [`mainapp/services/db.js`](mainapp/services/db.js#L18) | L18–L32 | 13 indexes: Title, ISBN, AuthorName, AuthorID→BookID junction (both directions), CopyID→BookID, AccessionNumber, LoanCopyID, LoanMemberID, LoanStatus, MemberLastName, MemberEmail, CategoryName |
| [`mainapp/services/db.js`](mainapp/services/db.js#L38) | L38–L48 | `ensureIndexes()` — iterates the list and silently skips already-existing indexes |

**Why these indexes for 20k+ rows:**

- `idx_loans_status` + `idx_loans_copyid` — the most frequently hit path in every availability subquery.
- `idx_books_title` + `idx_authors_name` — accelerate `LIKE` prefix searches in the books and borrowing modals.
- `idx_copies_bookid` — supports the per-book copy-count subqueries in `getAll`.
- `idx_members_email` — supports unique email lookup during registration.

**In-memory caching layer (supplementary):**

| File | Lines | Cache |
|------|-------|-------|
| [`main.js`](main.js#L18) | L18–L19 | `booksCache` and `booksCategoriesCache` — populated at login |
| [`main.js`](main.js#L185) | L185–L186 | Background prefetch triggered immediately after successful login |
| [`main.js`](main.js#L256) | L256–L258 | Cache served on `books:all` IPC calls |
| [`main.js`](main.js#L21) | L21–L24 | `invalidateBooksCaches()` — clears both caches on any mutation |
| [`mainapp/services/lookup.js`](mainapp/services/lookup.js#L6) | L6 | Categories cache with 5-minute TTL |
| [`mainapp/books.html`](mainapp/books.html#L169) | L169–L205 | Client-side session-storage preload — instant render on tab revisit |

---

### 3.3 Logic & Automation — Action Queries & Built-in Functions

#### Action Queries (INSERT / UPDATE / DELETE via `execute`)

All data-mutation SQL is issued through `db.execute()`, the equivalent of Access action queries. They are not ad-hoc strings typed in the UI — they are named, encapsulated methods exposed over IPC.

| File | Line | Action Query |
|------|------|-------------|
| [`mainapp/services/books.js`](mainapp/services/books.js#L304) | L304–L305 | `INSERT INTO Books_Table` — add book |
| [`mainapp/services/books.js`](mainapp/services/books.js#L328) | L328–L330 | `UPDATE Books_Table` — edit book |
| [`mainapp/services/books.js`](mainapp/services/books.js#L352) | L352–L355 | `DELETE` cascade: authors → categories → copies → book |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L224) | L224–L226 | `INSERT INTO Loans_Table` — issue a loan |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L271) | L271 | `UPDATE Loans_Table SET … LoanStatus='Returned'` — mark returned |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L275) | L275–L280 | `UPDATE BookCopies_Table` — update copy condition on return |
| [`mainapp/services/members.js`](mainapp/services/members.js#L64) | L64–L68 | `INSERT INTO Users_Table` — create login account |
| [`mainapp/services/members.js`](mainapp/services/members.js#L75) | L75–L83 | `INSERT INTO Members_Table` — create linked member record |
| [`mainapp/services/members.js`](mainapp/services/members.js#L114) | L114–L125 | `UPDATE Members_Table / Users_Table` — sync login access based on suspension using strict `true`/`false` |

#### Access / Jet Built-in Functions

Access Jet built-in functions are used directly in SQL strings instead of JavaScript post-processing, keeping date logic server-side and accurate to the database's own clock.

| File | Line | Function | Purpose |
|------|------|----------|---------|
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L225) | L225 | `DateAdd('d', ?, Date())` | Calculate due date at loan creation |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L175) | L175 | `DateDiff('d', l.DueDate, Date())` | Compute days overdue in the overdue report |
| [`mainapp/services/borrowing.js`](mainapp/services/borrowing.js#L346) | L346 | `DateAdd('d', 7, Date())` | Auto-set reservation expiry to 7 days |
| [`mainapp/services/books.js`](mainapp/services/books.js#L270) | L270 | `IIF(l.LoanID IS NULL, …)` | Derive copy status inline without a second query |
| [`mainapp/services/lookup.js`](mainapp/services/lookup.js#L149) | L149 | `Now()` | Timestamp audit log entries with database time |

---

### 3.4 Security — User Management & UI Privileges

#### Authentication & Password Hashing

| File | Lines | What It Does |
|------|-------|-------------|
| [`mainapp/services/auth.js`](mainapp/services/auth.js#L26) | L26–L28 | `hashPassword()` — SHA-256 with a static salt prefix; plain-text is never stored |
| [`mainapp/services/auth.js`](mainapp/services/auth.js#L30) | L30–L32 | `verifyPassword()` — constant-time comparison by re-hashing |
| [`mainapp/services/auth.js`](mainapp/services/auth.js#L36) | L36–L115 | `Auth.login()` — username lookup, **Members_Table status verification**, password verification, and **Auto-Awake** logic |
| [`mainapp/services/auth.js`](mainapp/services/auth.js#L51) | L51 | `WHERE Username = ?` — parameterised query; safe against SQL injection |
| [`mainapp/services/auth.js`](mainapp/services/auth.js#L126) | L126 | Duplicate-username check before INSERT |
| [`mainapp/services/auth.js`](mainapp/services/auth.js#L117) | L117 | Registration wrapped in transaction |
| [`main.js`](main.js#L47) | L47–L52 | `assertAdmin()` — server-side role guard; throws if caller is not Admin |
| [`main.js`](main.js#L179) | L179 | `auth:login` IPC handler — stores session in main-process memory only |

#### Session Guard (authCheck)

| File | Lines | What It Does |
|------|-------|-------------|
| [`mainapp/services/authCheck.js`](mainapp/services/authCheck.js#L1) | L1–L22 | Checks `auth:session` on every page load; redirects to `login.html` if no session exists |

#### Role-Based Access Control

| File | Lines | What It Does |
|------|-------|-------------|
| [`mainapp/services/roleAccess.js`](mainapp/services/roleAccess.js#L15) | L15–L19 | `SIDEBAR_LINKS` map — defines which nav items each role can see |
| [`mainapp/services/roleAccess.js`](mainapp/services/roleAccess.js#L22) | L22 | `ALLOWED_PAGES` — used to redirect if a role tries to access a forbidden page |
| [`mainapp/services/roleAccess.js`](mainapp/services/roleAccess.js#L64) | L64–L87 | `applySidebarRestrictions()` — hides disallowed nav links and their section labels |
| [`mainapp/services/roleAccess.js`](mainapp/services/roleAccess.js#L99) | L99–L108 | `enforcePageAccess()` — server-side-style redirect if URL is accessed directly |
| [`mainapp/services/roleAccess.js`](mainapp/services/roleAccess.js#L113) | L113–L124 | `applyMemberRestrictions()` — hides Add Book, Export, and the Actions column for Members |

**Access matrix (from README):**

| Feature | Member | Librarian | Admin |
|---------|--------|-----------|-------|
| Books (read-only) | ✅ | ✅ | ✅ |
| Books (add / edit / delete / export) | ❌ | ✅ | ✅ |
| Dashboard / Members / Borrowing / Reports | ❌ | ✅ | ✅ |
| Librarian Management | ❌ | ❌ | ✅ |
| Backup & Recovery | ❌ | ❌ | ✅ |

---

### 3.5 Maintenance — Backup & Recovery

#### Automated Daily Backup

The application checks at startup and every hour whether the auto-backup file is more than 24 hours old. If it is, it closes the database connection, copies the `.accdb` file, then reconnects.

| File | Lines | What It Does |
|------|-------|-------------|
| [`main.js`](main.js#L35) | L35–L36 | `ONE_DAY_MS` and `AUTO_BACKUP_CHECK_INTERVAL_MS` — backup policy constants |
| [`main.js`](main.js#L88) | L88–L97 | `shouldCreateAutoBackup()` — compares file modified-time to 24-hour threshold |
| [`main.js`](main.js#L101) | L101–L120 | `runDailyAutoBackup()` — closes DB, copies file to `backups/LMS-auto-backup.accdb`, reconnects |
| [`main.js`](main.js#L125) | L125–L131 | `startAutoBackupScheduler()` — `setInterval` runs every hour |
| [`main.js`](main.js#L162) | L162–L163 | Triggered on app start inside `app.whenReady()` |

#### Manual Backup / Restore / Delete (Admin Only)

All three handlers call `assertAdmin()` before acting, so non-admin users are rejected at the IPC level even if they bypass the UI.

| File | Lines | Action |
|------|-------|--------|
| [`main.js`](main.js#L413) | L413–L428 | `backup:create` — timestamped copy of `LMS.accdb` into `backups/` |
| [`main.js`](main.js#L431) | L431–L445 | `backup:restore` — copies chosen backup file back over `LMS.accdb` |
| [`main.js`](main.js#L448) | L448–L454 | `backup:delete` — removes a named backup file |
| [`main.js`](main.js#L47) | L47–L52 | `assertAdmin()` — called at the top of each handler |

#### Backup UI

| File | Lines | What It Does |
|------|-------|-------------|
| [`mainapp/backup-recovery.html`](mainapp/backup-recovery.html#L44) | L44 | Informational banner warning to backup before major changes |
| [`mainapp/backup-recovery.html`](mainapp/backup-recovery.html#L108) | L108–L114 | `loadBackups()` — fetches and renders the backup list table |
| [`mainapp/backup-recovery.html`](mainapp/backup-recovery.html#L117) | L117–L124 | `createBackup()` — calls IPC, shows success/failure, refreshes list |
| [`mainapp/backup-recovery.html`](mainapp/backup-recovery.html#L126) | L126–L133 | `restoreBackup()` — confirm dialog before overwriting current database |
| [`mainapp/backup-recovery.html`](mainapp/backup-recovery.html#L135) | L135–L143 | `deleteBackup()` — confirm dialog before removing backup file |

---

*All line numbers reference the current state of the repository as of the latest commit.*
