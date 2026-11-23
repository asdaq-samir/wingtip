-- Whether an airplane is flown for hire (V32) is null until its owner says:
-- the FALSE every airplane was given by default read as "not for hire", so
-- one whose owner never answered got no 100-hour reminder and no Go/No-Go
-- factor (14 CFR 91.409(b); the safety audit of 2026-11-23, L4). The
-- engine weighs an unknown as for hire, the safe side. A FALSE already kept
-- cannot be told from the default, so each is asked again.
ALTER TABLE aircraft ALTER COLUMN for_hire DROP NOT NULL;
ALTER TABLE aircraft ALTER COLUMN for_hire DROP DEFAULT;
UPDATE aircraft SET for_hire = NULL WHERE for_hire = FALSE;
