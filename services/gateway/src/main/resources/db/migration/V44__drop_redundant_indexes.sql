-- Two indexes that only repeated the first column of a unique constraint
-- on the same table (V3): uq_aircraft_pilot_tail (pilot_id, tail_number)
-- already answers a lookup by pilot_id, and uq_flight_checkpoint_sequence
-- (flight_id, sequence_no) one by flight_id, in the nav log's order too.
-- Postgres reads a composite index by its leading column, so these two
-- only cost every insert, update and delete an index of their own to keep.
DROP INDEX IF EXISTS idx_aircraft_pilot_id;
DROP INDEX IF EXISTS idx_flight_checkpoints_flight_id;
