-- Session fingerprint binding (commit c820363)
-- Required BEFORE deploying code that selects sessions.fingerprint,
-- otherwise every authenticated request 500s (missing column).
ALTER TABLE sessions ADD COLUMN fingerprint TEXT;
