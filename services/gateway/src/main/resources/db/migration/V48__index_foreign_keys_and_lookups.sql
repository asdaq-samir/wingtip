-- Indexes for what deletes and looks up by a column no index led with
-- (the ops audit, 2026-11-21, every repository's query read against the
-- indexes). Postgres indexes a primary key and a unique constraint, never
-- the referencing side of a foreign key: deleting a flight, an airplane or
-- a pilot then reads the whole of each table that refers to it, once per
-- row deleted, inside the deleting transaction. Small tables today; an
-- account deletion that reads every pilot's logbook is the kind of query
-- that turns slow as the app grows. Each is partial where most rows hold
-- no value. IndexCoverageTest checks every foreign key stays covered.

-- A flight deleted: its review (cross_country_reviews, ON DELETE CASCADE)
-- and the logbook entry made from its track (ON DELETE SET NULL).
CREATE INDEX idx_cross_country_reviews_flight ON cross_country_reviews (flight_id);
CREATE INDEX idx_logbook_entries_flight ON logbook_entries (flight_id) WHERE flight_id IS NOT NULL;

-- An airplane deleted: the flights planned in it keep their nav log and
-- lose the airplane (ON DELETE SET NULL).
CREATE INDEX idx_flights_aircraft ON flights (aircraft_id) WHERE aircraft_id IS NOT NULL;

-- A pilot deleted: their watches (ON DELETE CASCADE).
CREATE INDEX idx_flight_watch_pilot ON flight_watch (pilot_id);

-- A pilot's flights, newest first (FlightRepository.findByPilotIdOrderByCreatedAtDesc),
-- read in the index's order, where the old index found them and sorted.
CREATE INDEX idx_flights_pilot_created ON flights (pilot_id, created_at DESC);
DROP INDEX IF EXISTS idx_flights_pilot_id;

-- Sign-in links: the nightly letting go of expired ones
-- (MagicLinkRepository.deleteExpiredBefore) and an account's deletion,
-- which takes every link sent to its address, case aside (deleteByEmail).
CREATE INDEX idx_magic_links_expires ON magic_links (expires_at);
CREATE INDEX idx_magic_links_email ON magic_links (lower(email));
