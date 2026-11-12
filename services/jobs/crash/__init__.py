"""The crash-leads job (services/jobs/crash): stages 1 to 3 of the
Studio's crash films (docs/STUDIO-PIPELINE.md). Each run reads the FAA's
statements and preliminary notices (and the NTSB's records, once
claude/studio-2's reader lands) into leads, checks each lead's identity
against the FAA's registry and an ADS-B track (the engine's
occurrence_identity), and makes a kit for each confirmed one, all into
wingtip.crash_drafts' store, which the planner serves to the Studio.
`python -m crash` (cli.py)."""
