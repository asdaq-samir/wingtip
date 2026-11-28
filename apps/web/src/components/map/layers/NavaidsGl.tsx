import { useEffect } from "react";
import { useMarkKey, useNavaidKey } from "../../../lib/address";
import { MapCard } from "../../../lib/map/cards/MapCard";
import { SheetCard } from "../../SheetCard";
import type { VorPin } from "../../../lib/map/sources/overlayTypes";
import { usePreferences } from "../../../lib/preferences";
import { FixCard, VorCard } from "../cards/NavaidCards";
import { usePointActions } from "../../../lib/map/cards/pointActions";
import { WaypointCard } from "../cards/WaypointCard";
import { useGlMap, useGlTap } from "../../../lib/map/gl/glLayer";
import { OVERLAY_SOURCE, setOverlayExclusion } from "../../../lib/map/gl/glOverlays";
import { pointOf, vorOfTile } from "../../../lib/map/gl/glTileFeatures";
import { useGlProbe } from "../../../lib/map/gl/useGlProbe";
import { NEAR_DEG, useLinkedTileFeature } from "../../../lib/map/gl/useLinkedTileFeature";
import { TAP } from "../../../lib/map/gl/layers/common";
import { pickOnMap, useMapPickOwner } from "../../../lib/map/mapPick";
import { OVERLAY_EXPRESSIONS } from "../../../lib/generated/overlayLayers";

const VFR = "vfr-waypoints";

/**
 * The VORs and, closer in, the low enroute chart's fixes, at glOverlays'
 * zooms and the settings' VORs and Fixes; a tap a station's card (VorCard,
 * FixCard).
 *
 * The marks are the cycle's overlay tiles' (glOverlays): a VOR's card is
 * built from the station's fields in the tiles, and the VORs a fix's card
 * and the waypoints' place themselves off are the ones in the tiles
 * loaded. Nothing until the map has the tiles.
 */
export function NavaidsGl() {
  const { overlays } = useGlMap();
  return overlays ? <TileNavaids /> : null;
}

/** The VORs of the overlay tiles loaded round the view, as VorPins. */
function tileVors(map: ReturnType<typeof useGlMap>["map"]): VorPin[] {
  const seen = new Map<string, VorPin>();
  for (const f of map.querySourceFeatures(OVERLAY_SOURCE, { sourceLayer: "navaids", filter: OVERLAY_EXPRESSIONS.vorKinds })) {
    const vor = vorOfTile(f);
    seen.set(`${vor.ident}-${vor.lat}`, vor);
  }
  return [...seen.values()];
}

function TileNavaids() {
  const { map } = useGlMap();
  const show = usePreferences((s) => s.aeronautical);
  // The VORs about the view, for the point cards' "off a VOR" (pointActions'
  // stations), at each rest.
  useEffect(() => {
    const rest = () => {
      const stations = usePreferences.getState().aeronautical ? tileVors(map) : [];
      const was = usePointActions.getState().stations;
      const key = (list: readonly { ident: string; lat: number }[]) => list.map((v) => `${v.ident}-${v.lat}`).join();
      if (key(stations) !== key(was)) usePointActions.setState({ stations });
    };
    rest();
    map.on("idle", rest);
    return () => {
      map.off("idle", rest);
    };
  }, [map, show]);
  // The VOR whose card is open, in the address (`navaid`), and the fix's or
  // the VFR waypoint's (`mark`): every card reached by a link (the owner's
  // rule on easy navigation), a tap and its link opening the same card and
  // its ✕ taking the key off. A fix's and a waypoint's card is drawn from
  // its link alone; a VOR's from the station in the tiles.
  const [open, setOpen] = useNavaidKey();
  const [mark, setMark] = useMarkKey();
  const point = mark && mark.kind !== "airspace" ? mark : null;
  const linked = useLinkedTileFeature(map, open && { key: `${open.ident}@${open.lat},${open.lon}`, ...open }, () =>
    open
      ? (tileVors(map).find(
          (v) => v.ident === open.ident && Math.abs(v.lat - open.lat) < NEAR_DEG && Math.abs(v.lon - open.lon) < NEAR_DEG,
        ) ?? null)
      : null,
  );
  useGlProbe("navaid-marks", ["navaids", "fixes"], (f) => ({ ident: f.properties.ident, kind: f.layer.id === "fixes" ? "fix" : "vor" }));
  useGlTap(["navaids", "fixes"], TAP.mark, TAP.rank.mark + 1, (feature) => {
    const at = pointOf(feature);
    if (!at) return;
    // Every other card and ring put away first (lib/map/mapPick), and this
    // one opened by its address.
    if (feature.layer.id === "navaids") {
      const vor = vorOfTile(feature);
      pickOnMap("navaid");
      void setOpen({ ident: vor.ident, lat: vor.lat, lon: vor.lon });
    } else {
      pickOnMap("mark");
      void setMark({ kind: "fix", ident: String(feature.properties.ident), ...at });
    }
  });
  const closeVor = () => void setOpen(null);
  const closeMark = () => void setMark(null);
  useMapPickOwner("navaid", !!open, closeVor);
  useMapPickOwner("mark", !!point, closeMark);
  return (
    <>
      {open && linked !== undefined && (
        <SheetCard onClose={closeVor}>
          {linked ? (
            <VorCard key={`${linked.ident}-${linked.lat}`} vor={linked} />
          ) : (
            // A link to one the cycle's tiles do not have there (shut down,
            // or a link from another cycle): said in its card, where it was
            // asked.
            <MapCard title={open.ident} subtitle="Not in this cycle's chart data" />
          )}
        </SheetCard>
      )}
      {point && (
        <SheetCard onClose={closeMark}>
          {point.kind === "fix" ? (
            <FixCard key={`fix-${point.ident}-${point.lat}`} fix={point} />
          ) : (
            <WaypointCard key={`vfr-${point.ident}-${point.lat}`} waypoint={point} />
          )}
        </SheetCard>
      )}
    </>
  );
}

/** The VFR waypoints from map.zoom's fix (glOverlays' FIX_ZOOM): green triangles, a
 *  tap the waypoint's card (by its address, TileNavaids drawing it); the
 *  route's own left to it (`exclude`). From the overlay tiles' fixes
 *  (FIX_BASE's VFR waypoints). */
export function WaypointsGl({ exclude }: { exclude: Set<string> }) {
  const { overlays } = useGlMap();
  return overlays ? <TileWaypoints exclude={exclude} /> : null;
}

function TileWaypoints({ exclude }: { exclude: Set<string> }) {
  const { map } = useGlMap();
  const [, setMark] = useMarkKey();
  const key = [...exclude].sort().join();
  useEffect(() => {
    setOverlayExclusion(map, "waypoints", key ? key.split(",") : []);
  }, [map, key]);
  useEffect(() => () => setOverlayExclusion(map, "waypoints", []), [map]);
  useGlProbe("navaid-marks", [VFR], (f) => ({ ident: f.properties.ident, kind: "vfr" }));
  useGlTap([VFR], TAP.mark, TAP.rank.mark + 1, (feature) => {
    const at = pointOf(feature);
    if (!at) return;
    pickOnMap("mark");
    void setMark({ kind: "vfr", ident: String(feature.properties.ident), ...at });
  });
  return null;
}
