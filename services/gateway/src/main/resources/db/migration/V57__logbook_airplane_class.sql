-- What passenger currency is judged by (14 CFR 61.57(a)(1)(ii): landings
-- "in an aircraft of the same category, class, and type", and "if the
-- aircraft to be flown is an airplane with a tailwheel ... to a full stop in
-- an airplane with a tailwheel"; round 7's N7). Each null where the pilot
-- hasn't said: the engine then counts the entry toward none and says it
-- can't tell, never current on a guess.
ALTER TABLE logbook_entries ADD COLUMN category VARCHAR(20);
ALTER TABLE logbook_entries ADD COLUMN aircraft_class VARCHAR(24);
ALTER TABLE logbook_entries ADD COLUMN tailwheel BOOLEAN;
ALTER TABLE logbook_entries ADD COLUMN full_stop_landings INTEGER;
