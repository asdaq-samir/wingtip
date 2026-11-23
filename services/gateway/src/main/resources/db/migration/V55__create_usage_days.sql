-- How many calls each planner route answered each UTC day, with what
-- status, read nightly from the planner's /api/usage/daily (UsageRollup),
-- so the totals outlive the planner's disk and a server replaced (round 4's
-- product audit, H2; the owner took totals only). Counts alone: no point,
-- ident, query, pilot, device or address (docs/privacy-inventory.md).
CREATE TABLE usage_days (
    day DATE NOT NULL,
    route VARCHAR(300) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status SMALLINT NOT NULL,
    calls BIGINT NOT NULL CHECK (calls >= 0),
    PRIMARY KEY (day, route, method, status)
);
