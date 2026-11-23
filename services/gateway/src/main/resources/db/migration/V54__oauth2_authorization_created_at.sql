-- When each connector authorization was begun, so one the pilot never
-- finished can be let go (ConnectorHousekeeping). A request waiting on the
-- consent page is saved with no code and no token, so all three expiry
-- columns the nightly sweep reads are null, and it was kept for ever with
-- its client: a free account could grow the table with GET
-- /oauth2/authorize (round 4's security review, L2). Spring's JDBC store
-- names its columns on insert, so the default fills this for every new
-- row; a row from before is dated now, and goes a day from now if it is
-- still unfinished.
ALTER TABLE oauth2_authorization ADD COLUMN created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL;
