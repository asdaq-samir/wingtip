import type { MapGeoJSONFeature } from "maplibre-gl";
import type { AirspaceVolume, VorPin } from "../sources/overlayTypes";

/** What a card needs, from a tapped feature of the overlay tiles. */

const text = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const number = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** A tapped ring of the tiles' `airspace` layer as the volume the
 *  card reads (AirspaceCardBody): its fields are wingtip.vector_tiles'
 *  (CLASS, NAME, IDENT, the floor and ceiling, TNI, WKHR_CODE/RMK). */
export function volumeOfTile(f: Pick<MapGeoJSONFeature, "properties">): AirspaceVolume {
  const p = f.properties;
  const floor = number(p.floor_ft) ?? 0;
  return {
    id: `tile-${p.number ?? `${p.class}-${p.ident ?? ""}-${p.name ?? ""}-${floor}`}`,
    name: String(p.name ?? ""),
    ident: text(p.ident),
    airspace_class: String(p.class) as AirspaceVolume["airspace_class"],
    floor_ft: floor,
    floor_sfc: floor === 0,
    ceiling_ft: number(p.ceiling_ft),
    ceiling_excluded: p.ceiling_excluded === true || p.ceiling_excluded === "true",
    hours_code: text(p.hours_code),
    hours_remark: text(p.hours_remark),
  };
}

/** A VOR of the tiles' `navaids` layer as the card reads it (VorCard):
 *  NASR NAV_BASE's fields as wingtip.fixes reads them, its remarks
 *  (NAV_RMK, one a line) where the archive carries them. */
export function vorOfTile(f: Pick<MapGeoJSONFeature, "properties" | "geometry">): VorPin {
  const p = f.properties;
  const [lon, lat] = f.geometry.type === "Point" ? (f.geometry.coordinates as [number, number]) : [0, 0];
  return {
    ident: String(p.ident),
    name: text(p.name),
    kind: String(p.kind) as VorPin["kind"],
    lat,
    lon,
    freq: text(p.freq),
    channel: text(p.channel),
    service_volume: text(p.service_volume),
    mag_var: number(p.mag_var),
    elevation_ft: number(p.elevation_ft),
    hours: text(p.hours),
    restricted: p.restricted === true || p.restricted === "true",
    remarks: text(p.remarks)?.split("\n") ?? [],
  };
}

/** A point feature's place. */
export function pointOf(f: Pick<MapGeoJSONFeature, "geometry">): { lat: number; lon: number } | null {
  if (f.geometry.type !== "Point") return null;
  const [lon, lat] = f.geometry.coordinates as [number, number];
  return { lat, lon };
}
