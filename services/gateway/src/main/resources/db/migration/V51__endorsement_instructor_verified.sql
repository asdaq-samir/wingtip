-- Whether the FAA airmen registry bore out the instructor who signed
-- (the engine's instructor_verification, asked through the planner at
-- signing; the deep security review of 2026-11-21, N1): an endorsement
-- counts as signed only where it did (14 CFR 61.1, 61.189(a)), and is
-- labelled Not verified otherwise. The registry's record matched (the
-- FAA's unique id, A or C and seven digits) is kept so one record is
-- signed as by one account only; the verdict's words as the pilot reads
-- them. Endorsements signed before this were never checked: false.
ALTER TABLE signed_endorsements
    ADD COLUMN instructor_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN instructor_registry_id VARCHAR(8),
    ADD COLUMN verification VARCHAR(300);

CREATE INDEX idx_signed_endorsements_registry ON signed_endorsements (instructor_registry_id)
    WHERE instructor_verified;
