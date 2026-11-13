-- The descent's own indicated airspeed and fuel flow, beside the climb's.
-- The nav log flies the descent as a phase of its own, at the airspeed a
-- handbook gives for it (indicated, so the engine turns it to true at the
-- altitudes it passes through) and burning what the descent burns, not
-- the cruise's flow. Nullable: an airplane added before these, or whose
-- owner has not said, descends on its cruise figures, and the app asks
-- for these where the nav log needs them (no airplane's figures assumed).
ALTER TABLE aircraft ADD COLUMN descent_ias_kt DOUBLE PRECISION;
ALTER TABLE aircraft ADD COLUMN descent_fuel_burn_gph DOUBLE PRECISION;
