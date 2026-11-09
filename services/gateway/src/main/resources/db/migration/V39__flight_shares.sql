-- A saved flight shared by link (POST /api/flights/{id}/share): read-only,
-- to whoever has the link, until the pilot stops sharing it, which deletes
-- the row. One a flight; gone with the flight. The token is 128 random
-- bits as URL-safe base64 (22 characters), the reader's only key; the
-- N-number goes with the plan only where the pilot turned it on.
CREATE TABLE flight_shares (
    flight_id BIGINT PRIMARY KEY REFERENCES flights (id) ON DELETE CASCADE,
    token VARCHAR(32) NOT NULL UNIQUE,
    include_tail BOOLEAN NOT NULL DEFAULT FALSE,
    shared_at TIMESTAMP WITH TIME ZONE NOT NULL
);
