import type { DiagnosticsReport } from "../diagnostics";
import type { paths as GatewayPaths } from "./gateway-schema";

/** The gateway's diagnostics door (DiagnosticsController), its path typed
 *  by the gateway's document so a change to it fails the build. */
const DOOR = "/api/diagnostics" satisfies keyof GatewayPaths;

/** Sends a report to the diagnostics door; false where the browser cannot
 *  or would not. Sent with sendBeacon, which outlives the page and carries
 *  no credentials, so no session rides with a report. */
export function sendDiagnostics(report: DiagnosticsReport, nav: Navigator = navigator): boolean {
  return typeof nav.sendBeacon === "function" && nav.sendBeacon(DOOR, new Blob([JSON.stringify(report)], { type: "application/json" }));
}
