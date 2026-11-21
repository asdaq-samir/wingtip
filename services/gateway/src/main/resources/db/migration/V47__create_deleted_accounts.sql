-- Each account deleted, by its id and when: no name, no address, nothing
-- else of the pilot's. A restore from a backup made before a deletion
-- would bring that account back (backups are kept up to 44 days,
-- docs/privacy-inventory.md), so after any restore the ids listed here
-- are deleted again (infra/server/reapply-deletions.sql,
-- docs/README-AWS.md "Backups and restore"; the prelaunch audit,
-- 2026-11-21, P3). It holds no foreign key: the pilot's row is the one
-- that goes. Kept as long as the oldest backup may be, then let go
-- (Housekeeping).
CREATE TABLE deleted_accounts (
    pilot_id BIGINT PRIMARY KEY,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
