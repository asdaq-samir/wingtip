-- What went wrong on a pilot's device, kept so the owner can see it
-- (DiagnosticsController): a crash, a hang, an exit the system forced or
-- an error nobody caught, from the web app, the iPhone app (MetricKit's
-- diagnostics) or the Android app (ApplicationExitInfo and its uncaught
-- handler). Nothing of the pilot's: no account, no address, no session,
-- no route, no position; the text is scrubbed of queries, email
-- addresses, home folders and per-install ids before it is kept
-- (DiagnosticText). A report is kept 90 days.
CREATE TABLE diagnostics (
    id BIGSERIAL PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    occurred_at TIMESTAMPTZ,
    platform VARCHAR(10) NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
    version VARCHAR(40) NOT NULL,
    os VARCHAR(40),
    device VARCHAR(10) NOT NULL CHECK (device IN ('phone', 'tablet', 'desktop')),
    kind VARCHAR(20) NOT NULL,
    signature VARCHAR(200) NOT NULL,
    detail TEXT
);

CREATE INDEX diagnostics_received_at ON diagnostics (received_at);

-- The phones' launch times and frame rates, and the web's long tasks, go
-- in the speed trend beside the browsers' Core Web Vitals, by platform.
ALTER TABLE speed_samples ALTER COLUMN source TYPE VARCHAR(10);
ALTER TABLE speed_samples DROP CONSTRAINT speed_samples_source_check;
ALTER TABLE speed_samples ADD CONSTRAINT speed_samples_source_check
    CHECK (source IN ('field', 'lab', 'web', 'ios', 'android'));
