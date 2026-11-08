-- The airplane's paperwork (#222). Whether it carries people for hire or
-- is given for flight instruction for hire, as its owner says: only then is
-- the 100-hour inspection asked for (14 CFR 91.409(b)), and only then is it
-- listed and reminded of.
ALTER TABLE aircraft ADD COLUMN for_hire BOOLEAN NOT NULL DEFAULT FALSE;

-- What else falls due on it, as its owner keeps it from its maintenance
-- records: an airworthiness directive's status -- its number and revision
-- date, the method of compliance and, for a recurring one, when the next
-- action is required (14 CFR 91.417(a)(2)(v)) -- or anything else the
-- owner wants reminded of. A day, a time in service, both or neither (a
-- one-time AD complied with). Gone with the airplane.
CREATE TABLE aircraft_due_items (
    id BIGSERIAL PRIMARY KEY,
    aircraft_id BIGINT NOT NULL REFERENCES aircraft (id) ON DELETE CASCADE,
    kind VARCHAR(8) NOT NULL CHECK (kind IN ('AD', 'OTHER')),
    title VARCHAR(120) NOT NULL,
    reference VARCHAR(60),
    method VARCHAR(200),
    due_on DATE,
    due_at_hours DOUBLE PRECISION
);
CREATE INDEX idx_aircraft_due_items_aircraft ON aircraft_due_items (aircraft_id);

-- A reminder's key now names an airplane's inspection or item too
-- ("aircraft-12-annual", "item-40"), longer than the pilot's own.
ALTER TABLE reminders_sent ALTER COLUMN what TYPE VARCHAR(64);
