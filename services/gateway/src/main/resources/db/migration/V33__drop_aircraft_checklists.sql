-- An airplane's checklists are kept on the pilot's own device now (#220,
-- the owner's option A, 2026-11-08: free, local, no account), on the web,
-- the iPhone and Android alike, and none of them asks the gateway's
-- checklist any more, so its endpoints and their table go. Nothing in it
-- was ever moved to a device: the lists start empty there by design.
DROP TABLE IF EXISTS aircraft_checklist_items;
