-- Each saved airplane's category, class and gear (14 CFR 61.5(b): category
-- "Airplane"; class "Single-engine land", "Multiengine land", "Single-engine
-- sea", "Multiengine sea"), so passenger currency can be judged for the
-- airplane to be flown (61.57(a)(1)(ii): "if the aircraft to be flown is an
-- airplane with a tailwheel"), and a logbook entry in it filled in with
-- them. Each null until its owner says: the engine judges an airplane not
-- said to be a tricycle as a tailwheel, the stricter.
ALTER TABLE aircraft ADD COLUMN category VARCHAR(20);
ALTER TABLE aircraft ADD COLUMN aircraft_class VARCHAR(24);
ALTER TABLE aircraft ADD COLUMN tailwheel BOOLEAN;
