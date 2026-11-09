import { deviceOf, versionOf } from "./speed";

/**
 * The one door the three apps report their faults and speed through
 * (the gateway's DiagnosticsController, POST /api/diagnostics): kept,
 * scrubbed again on the server, without anything of the pilot's. The web
 * sends its uncaught errors (errorReports) and its long tasks (longTasks)
 * here; the iPhone its MetricKit diagnostics and Android its exit reasons.
 *
 * Sent with sendBeacon, which outlives the page and carries no
 * credentials, so no session rides with a report.
 */
export interface Fault {
  kind: "error";
  signature: string;
  detail?: string;
  at: string;
}

export interface DiagnosticsReport {
  platform: "web";
  version: string;
  device: "phone" | "tablet" | "desktop";
  page?: string;
  faults?: Fault[];
  metrics?: Record<string, number>;
}

/** Where a report is from: the build and the kind of device; outside a
 *  browser (the unit tests), a development build on a desktop. */
export function originOf(win: Window | undefined = globalThis.window): Pick<DiagnosticsReport, "platform" | "version" | "device"> {
  if (!win?.matchMedia) return { platform: "web", version: "dev", device: "desktop" };
  return { platform: "web", version: versionOf(win.document), device: deviceOf(win) };
}

/** Sends a report; false where the browser cannot or would not. */
export function beacon(report: DiagnosticsReport, nav: Navigator = navigator): boolean {
  return typeof nav.sendBeacon === "function"
    && nav.sendBeacon("/api/diagnostics", new Blob([JSON.stringify(report)], { type: "application/json" }));
}
