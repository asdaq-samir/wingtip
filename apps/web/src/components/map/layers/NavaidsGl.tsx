import { useEffect } from "react";
import type { FixPin, VorPin } from "../../../lib/map/sources/overlayTypes";
import { usePreferences } from "../../../lib/preferences";
import { FixCard, VorCard } from "../cards/NavaidCards";
import { usePointActions } from "../../../lib/map/cards/pointActions";
import { WaypointCard, type Waypoint } from "../cards/WaypointCard";
import { useGlMap, useGlTap } from "../../../lib/map/gl/glLayer";
import { OVERLAY_SOURCE, pointOf, setOverlayExclusion, vorOfTile } from "../../../lib/map/gl/glOverlays";
import { useGlProbe } from "../../../lib/map/gl/useGlProbe";
import { TAP } from "../../../lib/map/gl/layers/common";

const VFR = "vfr-waypoints";

/**
 * The VORs and, closer in, the low enroute chart's fixes, at glOverlays'
 * zooms and the settings' VORs and Fixes; a tap a station's card (VorCard,
 * FixCard).
 *
 * The marks are the cycle's overlay tiles' (glOverlays): a card is built
 * from the tapped feature's fields, and the VORs a fix's card and the
 * waypoints' place themselves off are the ones in the tiles loaded.
 * Nothing until the map has the tiles.
 */
export function NavaidsGl() {
  const { overlays } = useGlMap();
  return overlays ? <TileNavaids /> : null;
}

/** The VORs of the overlay tiles loaded round the view, as VorPins. */
function tileVors(map: ReturnType<typeof useGlMap>["map"]): VorPin[] {
  const seen = new Map<string, VorPin>();
  for (const f of map.querySourceFeatures(OVERLAY_SOURCE, {
    sourceLayer: "navaids",
    filter: ["in", ["get", "kind"], ["literal", ["VORTAC", "VOR/DME", "VOR"]]],
  })) {
    const vor = vorOfTile(f);
    seen.set(`${vor.ident}-${vor.lat}`, vor);
  }
  return [...seen.values()];
}

function TileNavaids() {
  const { map, openCard } = useGlMap();
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
  useGlProbe("navaid-marks", ["navaids", "fixes"], (f) => ({ ident: f.properties.ident, kind: f.layer.id === "fixes" ? "fix" : "vor" }));
  useGlTap(["navaids", "fixes"], TAP.mark, TAP.rank.mark + 1, (feature) => {
    const at = pointOf(feature);
    if (!at) return;
    if (feature.layer.id === "navaids") {
      const vor = vorOfTile(feature);
      openCard(<VorCard key={`${vor.ident}-${vor.lat}`} vor={vor} />);
    } else {
      const fix: FixPin = { ident: String(feature.properties.ident), ...at };
      openCard(<FixCard key={`fix-${fix.ident}`} fix={fix} vors={tileVors(map)} />);
    }
  });
  return null;
}

/** The VFR waypoints from zoom 10 (glOverlays' FIX_ZOOM): green triangles, a
 *  tap the waypoint's card; the route's own left to it (`exclude`). From
 *  the overlay tiles' fixes (FIX_BASE's VFR waypoints). */
export function WaypointsGl({ exclude }: { exclude: Set<string> }) {
  const { overlays } = useGlMap();
  return overlays ? <TileWaypoints exclude={exclude} /> : null;
}

function TileWaypoints({ exclude }: { exclude: Set<string> }) {
  const { map, openCard } = useGlMap();
  const key = [...exclude].sort().join();
  useEffect(() => {
    setOverlayExclusion(map, "waypoints", key ? key.split(",") : []);
  }, [map, key]);
  useEffect(() => () => setOverlayExclusion(map, "waypoints", []), [map]);
  useGlProbe("navaid-marks", [VFR], (f) => ({ ident: f.properties.ident, kind: "vfr" }));
  useGlTap([VFR], TAP.mark, TAP.rank.mark + 1, (feature) => {
    const at = pointOf(feature);
    if (!at) return;
    const w: Waypoint = { ident: String(feature.properties.ident), ...at };
    openCard(<WaypointCard key={w.ident} waypoint={w} />);
  });
  return null;
}
