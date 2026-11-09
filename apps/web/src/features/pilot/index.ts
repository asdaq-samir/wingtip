/** The pilot's console and sign-in, as the rest of the app may use them:
 *  the two sign-in sheets a link opens (statically, on the first load) and
 *  the console's two chunks, each asked for by its loader so that naming
 *  this entry never pulls them into a first load. */
export { default as LinkSignIn } from "./LinkSignIn";
export { default as TvLink } from "./TvLink";
export const loadPilotPanel = () => import("./PilotPanel");
export const loadAccountPanels = () => import("./AccountPanels");
