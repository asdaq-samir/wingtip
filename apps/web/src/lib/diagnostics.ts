import { deviceOf, versionOf } from "./speed";

/**
 * The one door the three apps report their faults and speed through
 * (the gateway's DiagnosticsController, POST /api/diagnostics): kept,
 * scrubbed again on the server, without anything of the pilot's. The web
 * sends its uncaught errors (errorReports) and its long tasks (longTasks)
 * here, through lib/api's sendDiagnostics; the iPhone its MetricKit
 * diagnostics and Android its exit reasons.
 */
interface Fault {
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
