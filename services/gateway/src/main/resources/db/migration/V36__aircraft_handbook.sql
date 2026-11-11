-- An airplane's handbook figures, as its pilot confirmed them from a
-- photographed page (the assistant's POST /api/read-document, checked by
-- the engine's handbook_read_check): the cruise table, the climb and
-- glide, the takeoff and landing distances, the empty weight and arm, the
-- CG envelope and the fuel, in the app's units -- the contract's
-- HandbookFigures. Kept as sent: the gateway works none of it out.
-- Null until its pilot confirms a page.
ALTER TABLE aircraft ADD COLUMN handbook JSONB;
