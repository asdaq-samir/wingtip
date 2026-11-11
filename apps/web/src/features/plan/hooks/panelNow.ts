import type { PanelState } from "../../../lib/mapChrome";

/** The panel's size as of now (PlanWorkspace): one workspace is open at a
 *  time. A holder, not a ref, as the handlers that read it go out through
 *  the workspace's render prop, and the workspace's hooks read it alike.
 *  Read when tapped, not a dependency, so a turn of the sheet does not
 *  make every handler new (usePlanWorkspace). */
export const panelNow: { current: PanelState } = { current: "peek" };
