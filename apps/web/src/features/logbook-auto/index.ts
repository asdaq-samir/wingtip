/** A flight logged from the app's own track (the engine's
 *  logbook_from_track): the feature's one entry, and the recorded track
 *  forgotten as the pilot signs out (useLogout). */
export { default as AutoLogbookHost } from "./AutoLogbookLazy";
export { forget as forgetRecordedTrack } from "./recorder";
