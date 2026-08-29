-- FK constraint remediation: users.helpdeskId -> mesas.invgateId (set null)
--                        hidden_helpdesks.invgateId -> mesas.invgateId (cascade)
--
-- Run BEFORE `npm run db:push` on any DB that has orphan rows.
-- Pre-check script: scripts/check-fk-violations.ts

-- 1) users whose helpdesk_id is not in mesas.invgate_id -> NULL (set-null semantics)
--    Found on dev DB (2026-08-29): 2 rows, e2e test artifacts (helpdesk_id=2508).
UPDATE users
SET helpdesk_id = NULL
WHERE helpdesk_id IS NOT NULL
  AND helpdesk_id NOT IN (SELECT invgate_id FROM mesas);

-- 1b) sessions whose userId no longer exists (blocks users table recreate / FK checks)
--     Found on dev DB (2026-08-29): 7 rows.
DELETE FROM sessions
WHERE userId NOT IN (SELECT id FROM users);

-- 2) hidden_helpdesks rows whose invgate_id is not in mesas.invgate_id -> DELETE
--    (cascade semantics: row only meaningful while mesa exists)
--    Found on dev DB (2026-08-29): 2 rows (invgate_id 2, 2645).
DELETE FROM hidden_helpdesks
WHERE invgate_id NOT IN (SELECT invgate_id FROM mesas);

-- Verify after: PRAGMA foreign_key_check must return empty.
PRAGMA foreign_key_check;
