-- The connector's wider write, saving, changing and deleting a pilot's
-- saved flights, is a scope of its own, wingtip:flights (the security
-- review of 2026-11-22, L4). wingtip:write was consented to as "Save
-- flights to your Wingtip account", an add alone; Spring keeps a consent
-- and asks no more for a scope already consented, so the same name for
-- more would have granted changing and deleting without asking.
--
-- A registered client may now ask for the new scope in its place (its
-- scopes are comma-separated, as JdbcRegisteredClientRepository writes
-- them). Consents and issued tokens are left as they are: wingtip:write
-- grants nothing now, so each pilot is asked for wingtip:flights the next
-- time their AI app connects.
UPDATE oauth2_registered_client
SET scopes = array_to_string(array_replace(string_to_array(scopes, ','), 'wingtip:write', 'wingtip:flights'), ',')
WHERE 'wingtip:write' = ANY (string_to_array(scopes, ','));
