import { ago, dayMonthYear } from "../../../lib/format";
import { WINDS_MODELLED } from "../../../lib/windsAloft";

export const mae = (n: number) => n.toFixed(4);

/** "just now", "12m ago", "3h 5m ago" (lib/format ago), or the day past
 *  two days, "5 Jan 2026" (lib/format dayMonthYear, the app's one form of
 *  a day; it was the browser's locale's) -- for a timestamp that may be
 *  missing altogether. */
export function agoOrDate(iso: string | null | undefined): string {
  if (!iso) return "never";
  const since = Date.now() - new Date(iso).getTime();
  return since < 48 * 3600_000 ? ago(since) : dayMonthYear(new Date(iso));
}

/** What a section shows before the snapshot is here: that it is on its
 *  way, or that the planner did not answer. It said "Loading…" for
 *  ever when /api/status failed. */
export const waiting = (failed: boolean) => (failed ? "The planner did not answer." : "Asking the planner for its status…");

/** What a reference file is, for a developer who has not memorised the
 *  FAA's file names. */
export const DATASET_NAMES: Record<string, string> = {
  "DOF.DAT": "Obstacles",
  "NAV_BASE.csv": "Navaids",
  "APT_BASE.csv": "Airports",
  "Shape_Files/Class_Airspace.shp": "Airspace",
  metars: "METARs",
  tafs: "TAFs",
  airsigmets: "SIGMETs",
  airmets: "Alaska AIRMETs",
  pireps: "Pilot reports",
  gairmets: "G-AIRMETs",
  // The GFS's since the FB ended (lib/windsAloft), as the planner names them.
  "winds-06": `Winds aloft, ${WINDS_MODELLED}, next 6 h`,
  "winds-12": `Winds aloft, ${WINDS_MODELLED}, 12 h`,
  "winds-24": `Winds aloft, ${WINDS_MODELLED}, 24 h`,
  // The weather service's other products, as the Live feeds page lists them.
  glmp: "Gridded LAMP (GLMP)",
  tfrs: "TFRs",
  radar: "Radar mosaic",
};
