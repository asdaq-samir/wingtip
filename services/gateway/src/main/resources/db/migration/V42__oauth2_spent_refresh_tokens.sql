-- The connector's refresh tokens that have been rotated away (each is used
-- once, ConnectorClients), kept as SHA-256 hashes against the connection
-- they belonged to: one presented again means it was copied, and the whole
-- connection is revoked (RotatedRefreshTokens; OAuth 2.1 section 4.3.1, the
-- OAuth Security BCP, RFC 9700 section 4.14.2). Let go once its 30 days
-- would have run out (ConnectorHousekeeping) or with its connection.
CREATE TABLE oauth2_spent_refresh_token (
    token_hash char(64) NOT NULL,
    authorization_id varchar(100) NOT NULL,
    spent_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (token_hash)
);

CREATE INDEX oauth2_spent_refresh_token_authorization_id ON oauth2_spent_refresh_token (authorization_id);
