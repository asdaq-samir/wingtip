-- A pilot's address is one address whatever its case: Alice@x.com and
-- alice@x.com reach the same inbox (every provider the app signs in with
-- folds the local part's case), so they are one account. V3's UNIQUE (email)
-- compared bytes, so a magic link to one spelling and Apple's or Google's
-- answer with the other made two pilots (the deep security review of
-- 2026-11-21, N8). The address is kept as the pilot wrote it; the unique
-- index and every lookup (PilotRepository.findByEmail) fold its case.
--
-- Two pilots already sharing an address but for case are merged first,
-- each into the oldest (lowest id): every row of theirs is moved to it
-- through each foreign key that refers to pilots, the provider subjects it
-- lacks are carried over, and the emptied row goes. A merge that would
-- break a unique key (the same tail number in both, say) is undone as a
-- whole and the newer pilot is kept apart, under a reserved address
-- (RFC 2606 .invalid) no mail reaches, for the owner to merge by hand:
-- nothing of either pilot is lost. Each one is noted in
-- email_case_merges and raised as a NOTICE, which Flyway prints at start.

CREATE TABLE email_case_merges (
    id BIGSERIAL PRIMARY KEY,
    kept_pilot_id BIGINT NOT NULL,
    other_pilot_id BIGINT NOT NULL,
    outcome VARCHAR(16) NOT NULL CHECK (outcome IN ('merged', 'kept_apart')),
    detail TEXT,
    at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
    grp RECORD;
    other BIGINT;
    fk RECORD;
    g VARCHAR(255);
    ap VARCHAR(255);
BEGIN
    FOR grp IN
        SELECT lower(email) AS address, min(id) AS kept, array_agg(id ORDER BY id) AS ids
        FROM pilots GROUP BY lower(email) HAVING count(*) > 1
    LOOP
        FOREACH other IN ARRAY grp.ids[2:] LOOP
            BEGIN
                -- Every column that refers to pilots(id), whatever table
                -- holds it, so a table added later is never missed.
                FOR fk IN
                    SELECT c.conrelid::regclass AS tbl, a.attname AS col
                    FROM pg_constraint c
                    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
                    WHERE c.contype = 'f' AND c.confrelid = 'pilots'::regclass
                LOOP
                    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', fk.tbl, fk.col, fk.col)
                        USING grp.kept, other;
                END LOOP;
                -- The subjects the kept pilot lacks move only once the row
                -- holding them is gone (each is UNIQUE).
                SELECT google_subject, apple_subject INTO g, ap FROM pilots WHERE id = other;
                DELETE FROM pilots WHERE id = other;
                UPDATE pilots SET google_subject = coalesce(google_subject, g),
                    apple_subject = coalesce(apple_subject, ap)
                WHERE id = grp.kept;
                INSERT INTO email_case_merges (kept_pilot_id, other_pilot_id, outcome)
                    VALUES (grp.kept, other, 'merged');
                RAISE NOTICE 'V50: pilot % merged into pilot % (one address but for case)', other, grp.kept;
            EXCEPTION WHEN unique_violation OR foreign_key_violation THEN
                -- Everything of this merge is rolled back to the block's
                -- start; the newer pilot keeps all of theirs, apart.
                UPDATE pilots SET email = 'case-duplicate-' || id || '@merge-by-hand.invalid' WHERE id = other;
                INSERT INTO email_case_merges (kept_pilot_id, other_pilot_id, outcome, detail)
                    VALUES (grp.kept, other, 'kept_apart', grp.address || ': ' || SQLERRM);
                RAISE NOTICE 'V50: pilot % kept apart from pilot % for a hand merge: %', other, grp.kept, SQLERRM;
            END;
        END LOOP;
    END LOOP;
END $$;

ALTER TABLE pilots DROP CONSTRAINT pilots_email_key;
CREATE UNIQUE INDEX uq_pilots_email_lower ON pilots (lower(email));
