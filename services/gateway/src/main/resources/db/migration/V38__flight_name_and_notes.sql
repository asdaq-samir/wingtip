-- A saved flight's own name ("Lunch at Duluth") and the pilot's notes on
-- it, both changed in place on the saved-flights list (PATCH
-- /api/flights/{id}). Nullable: a flight with no name is shown by its
-- route, as every flight saved before these was.
ALTER TABLE flights ADD COLUMN name VARCHAR(80);
ALTER TABLE flights ADD COLUMN notes VARCHAR(2000);
