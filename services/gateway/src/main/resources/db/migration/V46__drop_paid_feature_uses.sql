-- The monthly count of each paid feature that called Claude (V19) is gone
-- with those features: the server makes no model call (decision 0041), so
-- nothing has counted a use since, and the table was only created,
-- exported and cascaded (the prelaunch audit, 2026-11-21, P9). Nothing is
-- launched, so it is dropped rather than kept empty.
DROP TABLE paid_feature_uses;
