-- The make and model a paper solo or solo cross-country endorsement names
-- (14 CFR 61.87(n); 61.93(c)(2): "for the specific make and model of
-- aircraft to be flown"; round 7's N9). Null where the pilot hasn't recorded
-- it: 61.93(d)(4) and (5) then say they can't tell.
ALTER TABLE pilot_endorsements ADD COLUMN make_model VARCHAR(80);
