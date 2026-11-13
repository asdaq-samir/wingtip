-- The connector's connections looked up by their client and by their pilot,
-- which Spring's own stores never do but this app does: the nightly
-- housekeeping lets go of clients nobody connected through
-- (ConnectorHousekeeping), and each MCP call asks whether the pilot's
-- connection is still there (ConnectorGrants.live). Without these each
-- would read the whole table.
CREATE INDEX oauth2_authorization_registered_client_id ON oauth2_authorization (registered_client_id);
CREATE INDEX oauth2_authorization_principal_name ON oauth2_authorization (principal_name);
