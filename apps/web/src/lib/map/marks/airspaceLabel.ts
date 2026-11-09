import { faaWords, placeWords } from "../../advisories";
import type { AirspaceVolume } from "../sources/overlayTypes";
import { altFt } from "../../format";

/** The figures of a volume's card (AirspaceCard), as the pilot reads
 *  them: its name, floor, ceiling and hours. */
type AirspaceFacts = { name: string; floor: string; ceiling: string; hours: string | null };

/** The FAA's boilerplate remark on a part-time volume, which says no more
 *  than its hours code does. */
const NOTAM_ONLY = /^legal description references notam\.?$/i;

/**
 * A volume's card in words. The name a place's, as it is written
 * ("CHICAGO, WAUKEGAN REGIONAL CLASS D" is "Chicago, Waukegan Regional
 * Class D", placeWords). The floor "SFC" or in feet MSL, the ceiling in
 * feet MSL, "up to but not including" it where the file says TNI (the
 * Chart User's Guide's minus). The hours from the FAA NASR Class
 * Airspace shapefile's WKHR_CODE and WKHR_RMK: "H24" continuous;
 * "NOTAM" part-time, in effect at the times a NOTAM sets and the Chart
 * Supplement then publishes (FAA JO 7400.11, the Class D and Class C
 * legal descriptions), with the remark where it says more than that;
 * else the remark itself, the FAA's capitals in sentence case
 * (faaWords).
 */
export function airspaceFacts(
  volume: Pick<AirspaceVolume, "name" | "floor_ft" | "floor_sfc" | "ceiling_ft" | "ceiling_excluded" | "hours_code" | "hours_remark">,
): AirspaceFacts {
  const ceiling =
    volume.ceiling_ft == null ? "—" : `${volume.ceiling_excluded ? "Up to but not including " : ""}${altFt(volume.ceiling_ft)} ft MSL`;
  return {
    name: placeWords(volume.name),
    floor: volume.floor_sfc ? "SFC" : `${altFt(volume.floor_ft)} ft MSL`,
    ceiling,
    hours: airspaceHours(volume.hours_code, volume.hours_remark),
  };
}

/** When a volume is in effect, in words (airspaceFacts), or none where
 *  the file says nothing. */
export function airspaceHours(code: string | null | undefined, remark: string | null | undefined): string | null {
  const said = remark && !NOTAM_ONLY.test(remark.trim()) ? faaWords(remark.trim()) : null;
  if (code === "H24") return "Continuous";
  if (code === "NOTAM") return said ? `By NOTAM. ${said}` : "By NOTAM";
  return said ?? null;
}
