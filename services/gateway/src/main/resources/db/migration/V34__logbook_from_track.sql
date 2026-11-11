-- A logbook entry drawn from the app's own flown track (the engine's
-- logbook_from_track, which the pilot reviews and confirms; the gateway
-- only keeps what it was sent): the air time beside the flight time, the
-- touch-and-goes among the day landings (61.57(a) counts them, (b) does
-- not), that it came from a track, and the saved flight it was flown as,
-- whose debrief it opens. Gone flight, entry kept: the link is cleared.
ALTER TABLE logbook_entries ADD COLUMN air_hours DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE logbook_entries ADD COLUMN touch_and_goes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE logbook_entries ADD COLUMN from_track BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE logbook_entries ADD COLUMN flight_id BIGINT REFERENCES flights (id) ON DELETE SET NULL;
ALTER TABLE logbook_entries ADD CONSTRAINT logbook_entries_air_hours CHECK (air_hours >= 0);
ALTER TABLE logbook_entries ADD CONSTRAINT logbook_entries_touch_and_goes CHECK (touch_and_goes >= 0);
