-- An airplane's own performance figures from its handbook, as its pilot
-- gives them: the service ceiling, the sea-level best rate of climb, the
-- fuel for start, taxi and takeoff, the still-air glide ratio, and the
-- basic empty weight and moment from its weight and balance record. With
-- these an airplane of a type the planner has no stock profile for is
-- planned on its own figures alone, never another airplane's (the owner,
-- 2026-11-09: nothing assumes a Cessna 172). Each nullable: one not given
-- is missing, and the app asks for it where it is needed.
ALTER TABLE aircraft ADD COLUMN service_ceiling_ft DOUBLE PRECISION;
ALTER TABLE aircraft ADD COLUMN climb_rate_fpm DOUBLE PRECISION;
ALTER TABLE aircraft ADD COLUMN taxi_fuel_gal DOUBLE PRECISION;
ALTER TABLE aircraft ADD COLUMN glide_ratio DOUBLE PRECISION;
ALTER TABLE aircraft ADD COLUMN empty_weight_lb DOUBLE PRECISION;
ALTER TABLE aircraft ADD COLUMN empty_moment_lb_in DOUBLE PRECISION;
