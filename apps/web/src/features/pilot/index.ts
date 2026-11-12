/** The pilot's console and sign-in, as the rest of the app may use them:
 *  the two sign-in sheets a link opens (each on its own chunk, behind its host) and
 *  the console's two chunks, each asked for by its loader so that naming
 *  this entry never pulls them into a first load. */
export { default as LinkSignIn } from "./LinkSignInHost";
export { default as TvLinkHost } from "./TvLinkHost";
export const loadPilotPanel = () => import("./PilotPanel");
export const loadAccountPanels = () => import("./AccountPanels");
export { default as AccountButton } from "./AccountButton";
