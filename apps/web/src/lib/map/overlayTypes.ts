/**
 * What a card reads of a tapped feature of the cycle's overlay tiles
 * (lib/map/overlayTiles; glOverlays' volumeOfTile and vorOfTile build
 * them from the fields wingtip.vector_tiles writes). The planner once
 * answered these for the view (/api/airspace/in-view, /api/navaids/in-view);
 * the tiles carry the same fields from the same FAA files.
 */

/** One Class B, C or D volume: a shelf of a Class B, the surface area or
 *  a shelf of a Class C, or a Class D, with its altitudes as the FAA NASR
 *  Class Airspace shapefile has them. */
export interface AirspaceVolume {
  /** The volume's own, the same from one tile to the next. */
  id: string;
  /** The primary airport's identifier (ORD, MDW, PWK), where it has one. */
  ident: string | null;
  name: string;
  airspace_class: "B" | "C" | "D";
  /** The floor in feet MSL; 0 at the surface (`floor_sfc`). */
  floor_ft: number;
  floor_sfc: boolean;
  /** The top in feet MSL; null where the file gives no number. */
  ceiling_ft: number | null;
  /** The top is "to but not including" `ceiling_ft` (the file's UPPER_DESC
   *  TNI): a Class D under a Class B shelf, which the chart prints as "-30". */
  ceiling_excluded: boolean;
  /** When the volume is in effect (WKHR_CODE): "H24" continuous, "NOTAM"
   *  part-time with its hours by NOTAM, "RMK" as `hours_remark` says
   *  (WKHR_RMK). */
  hours_code: string | null;
  hours_remark: string | null;
  /** Where its line was tapped. */
  label_lat: number;
  label_lon: number;
}

/** A VOR, VOR/DME or VORTAC (NASR's NAV_BASE). */
export interface VorPin {
  ident: string;
  name: string | null;
  kind: "VORTAC" | "VOR/DME" | "VOR";
  freq: string | null;
  lat: number;
  lon: number;
  /** The station's own magnetic variation, east positive (MAG_VARN): the
   *  declination its radials are aligned to. */
  mag_var: number | null;
  elevation_ft: number | null;
  /** Its TACAN or DME channel ("70X"). */
  channel: string | null;
  /** Its standard service volume's class: T, L, H, VL or VH (AIM 1-1-8). */
  service_volume: string | null;
  /** Its hours as NASR files them: "24" for continuous. */
  hours: string | null;
  /** In service with restrictions (NAV_STATUS "OPERATIONAL RESTRICTED"),
   *  which its remarks say. */
  restricted: boolean;
  /** Its remarks: where it is unusable (NAV_RMK), one a line. */
  remarks: string[];
}

/** A fix on the low-altitude enroute chart (NASR's FIX_BASE). */
export interface FixPin {
  ident: string;
  lat: number;
  lon: number;
}
