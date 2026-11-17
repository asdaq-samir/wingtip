/** Ready to fly: the Brief's last part and the once-only prompt as the
 *  pilot starts, the feature's entries. */
export { ReadyToFly } from "./ReadyToFlyLazy";
/** The prompt as the pilot starts (ReadyToFlyPrompt), on a chunk of its
 *  own: it shows only once a dry run or own ship starts, so it is asked for
 *  after the first screen rather than in its load (scripts/first-load.mjs). */
export const loadReadyToFlyPrompt = () => import("./ReadyToFlyPrompt");
