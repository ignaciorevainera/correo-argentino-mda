-- ============================================================
-- scripts/add-role-check.sql
-- Adds CHECK constraint on users.role (canonical values only).
-- For PROD. Local dev: applied via drizzle (src/db/schema.ts).
--
-- WARNING: SQLite cannot ALTER TABLE ADD CHECK. Full table
-- rebuild required. Back up the DB first:
--   copy database\mda.db database\mda.db.bak-role
--
-- Step 0 (pre-check): no non-canonical roles may exist, or the
-- INSERT..SELECT below will fail (that is intentional — fix data
-- with the normalization UPDATEs before continuing):
--   SELECT role, COUNT(*) FROM users GROUP BY role;
--
-- Optional one-time normalization (mirror of normalizeRole()) if
-- legacy variants exist. Run BEFORE step 1:
--   UPDATE users SET role='admin'       WHERE lower(trim(role))='admin';
--   UPDATE users SET role='supervisor'  WHERE lower(trim(role))='supervisor';
--   UPDATE users SET role='team_leader' WHERE lower(trim(replace(replace(role,'-',' '),'_',' ')))='team leader';
--   UPDATE users SET role='referent'    WHERE lower(trim(role)) IN ('referent','referente');
--   UPDATE users SET role='agent'       WHERE role NOT IN ('admin','supervisor','team_leader','referent','agent');
-- ============================================================

PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

-- 1. Create new table with CHECK constraint
CREATE TABLE `users_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`role` text DEFAULT 'agent' NOT NULL,
	`helpdesk_id` integer,
	`helpdesk_name` text,
	FOREIGN KEY (`helpdesk_id`) REFERENCES `mesas`(`invgate_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "users_role_check" CHECK("users"."role" in ('admin', 'supervisor', 'team_leader', 'referent', 'agent'))
);

-- 2. Copy data (fails if any role is non-canonical — see step 0)
INSERT INTO `users_new`("id", "username", "password", "role", "helpdesk_id", "helpdesk_name")
SELECT "id", "username", "password", "role", "helpdesk_id", "helpdesk_name" FROM `users`;

-- 3. Drop old, rename
DROP TABLE `users`;
ALTER TABLE `users_new` RENAME TO `users`;

-- 4. Recreate indexes
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);

COMMIT;

PRAGMA foreign_keys=ON;

-- 5. Verify
-- PRAGMA foreign_key_check;   -- must return no rows
-- PRAGMA integrity_check;     -- must return 'ok'
-- SELECT role, COUNT(*) FROM users GROUP BY role;
