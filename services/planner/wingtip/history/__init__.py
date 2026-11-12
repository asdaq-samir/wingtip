"""What was so on a day gone by, for the Studio's replay of a real flight
(app.routers.studio_history): the weather as it was (history.iem, put
together in history.weather_then), the NTSB's record of an accident
(history.ntsb), and the NOTAMs and TFRs kept each day from now on
(history.notam_archive). Each is read from its source once and kept on the
data volume beside the live store, so a replay never waits on a source
twice for the same day."""
