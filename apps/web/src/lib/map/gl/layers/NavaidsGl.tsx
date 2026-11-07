import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { FixPin, VorPin } from "../../../api/types";
import { usePreferences } from "../../../preferences";
import { FixCard, VorCard, navaidsQuery } from "../../NavaidCards";
import { usePointActions } from "../../pointActions";
import { WaypointCard, waypointsQuery, type Waypoint } from "../../WaypointCard";
import { addSvgImages, useGlData, useGlLayer, useGlMap, useGlTap } from "../glLayer";
import { FIX_ZOOM, NAVAID_PICTURES, OVERLAY_SOURCE, navaidMarks, pointOf, setOverlayExclusion, vorOfTile } from "../glOverlays";
import { useGlView } from "../useGlView";
import { useGlProbe } from "../useGlProbe";
import { TAP } from "./common";

const NAV = "navaids";
const VFR = "vfr-waypoints";
const empty = () => ({ type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] } });

const NONE_VORS: VorPin[] = [];
const NONE_FIXES: FixPin[] = [];

function point(kind: string, p: { ident: string; lat: number; lon: number; freq?: string | null }, key: string): GeoJSON.Feature {
  return { type: "Feature", properties: { kind, ident: p.ident, key, ...(p.freq ? { freq: p.freq } : {}) }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } };
}

function usePictures(): boolean {
  const { map } = useGlMap();
  const [ready, setReady] = useState(false);
  useEffect(() => { void addSvgImages(map, NAVAID_PICTURES).then(() => setReady(true)); }, [map]);
  return ready;
}

/**
 * The VORs and, closer in, the low enroute chart's fixes, at NavaidsLayer's
 * zooms and the settings' VORs and Fixes; a tap a station's card (VorCard,
 * FixCard).
 *
 * From the cycle's overlay tiles where the map has them (glOverlays): a
 * card is built from the tapped feature's fields, and the VORs a fix's
 * card and the waypoints' place themselves off are the ones in the tiles
 * loaded. Without them, the planner is asked for the view (navaidsQuery).
 */
export function NavaidsGl() {
  const { overlays } = useGlMap();
  return overlays ? <TileNavaids /> : <InViewNavaids />;
}

/** The VORs of the overlay tiles loaded round the view, as VorPins. */
function tileVors(map: ReturnType<typeof useGlMap>["map"]): VorPin[] {
  const seen = new Map<string, VorPin>();
  for (const f of map.querySourceFeatures(OVERLAY_SOURCE, { sourceLayer: "navaids", filter: ["in", ["get", "kind"], ["literal", ["VORTAC", "VOR/DME", "VOR"]]] })) {
    const vor = vorOfTile(f);
    seen.set(`${vor.ident}-${vor.lat}`, vor);
  }
  return [...seen.values()];
}

function TileNavaids() {
  const { map, openCard } = useGlMap();
  const show = usePreferences(s => s.navaids);
  // The VORs about the view, for the point cards' "off a VOR" (pointActions'
  // stations), at each rest.
  useEffect(() => {
    const rest = () => {
      const stations = usePreferences.getState().navaids ? tileVors(map) : [];
      const was = usePointActions.getState().stations;
      const key = (list: readonly { ident: string; lat: number }[]) => list.map(v => `${v.ident}-${v.lat}`).join();
      if (key(stations) !== key(was)) usePointActions.setState({ stations });
    };
    rest();
    map.on("idle", rest);
    return () => { map.off("idle", rest); };
  }, [map, show]);
  useGlProbe("navaid-marks", ["navaids", "fixes"], f => ({ ident: f.properties.ident, kind: f.layer.id === "fixes" ? "fix" : "vor" }));
  useGlTap(["navaids", "fixes"], TAP.mark, TAP.rank.mark + 1, feature => {
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

function InViewNavaids() {
  const show = usePreferences(s => s.navaids);
  const { box, level } = useGlView();
  const query = navaidsQuery(box, level, show);
  const { data } = useQuery({ ...query, placeholderData: keepPreviousData });
  const vors = query.enabled ? data?.vors ?? NONE_VORS : NONE_VORS;
  const fixes = query.enabled && level >= FIX_ZOOM ? data?.fixes ?? NONE_FIXES : NONE_FIXES;
  useEffect(() => { usePointActions.setState({ stations: show ? vors : [] }); }, [vors, show]);
  const ready = usePictures();
  useGlLayer("marks", { [NAV]: empty() }, navaidMarks(NAV, { source: NAV }));
  const features = useMemo<GeoJSON.FeatureCollection | null>(() => (ready ? {
    type: "FeatureCollection",
    features: [...fixes.map(f => point("fix", f, `fix-${f.ident}`)), ...vors.map(v => point("vor", v, `${v.ident}-${v.lat}`))],
  } : null), [ready, vors, fixes]);
  useGlData(NAV, features);
  useGlProbe("navaid-marks", [NAV], f => ({ ident: f.properties.ident, kind: f.properties.kind }));
  const { openCard } = useGlMap();
  useGlTap([NAV], TAP.mark, TAP.rank.mark + 1, feature => {
    const key = String(feature.properties.key);
    const vor = vors.find(v => `${v.ident}-${v.lat}` === key);
    const fix = fixes.find(f => `fix-${f.ident}` === key);
    if (vor) openCard(<VorCard key={key} vor={vor} />);
    else if (fix) openCard(<FixCard key={key} fix={fix} vors={vors} />);
  });
  return null;
}

/** The VFR waypoints from zoom 10, as WaypointsLayer: green triangles, a
 *  tap the waypoint's card; the route's own left to it (`exclude`). From
 *  the overlay tiles' fixes where the map has them (FIX_BASE's VFR
 *  waypoints), else asked for the view (waypointsQuery). */
export function WaypointsGl({ exclude }: { exclude: Set<string> }) {
  const { overlays } = useGlMap();
  return overlays ? <TileWaypoints exclude={exclude} /> : <InViewWaypoints exclude={exclude} />;
}

function TileWaypoints({ exclude }: { exclude: Set<string> }) {
  const { map, openCard } = useGlMap();
  const key = [...exclude].sort().join();
  useEffect(() => { setOverlayExclusion(map, "waypoints", key ? key.split(",") : []); }, [map, key]);
  useEffect(() => () => setOverlayExclusion(map, "waypoints", []), [map]);
  useGlProbe("navaid-marks", [VFR], f => ({ ident: f.properties.ident, kind: "vfr" }));
  useGlTap([VFR], TAP.mark, TAP.rank.mark + 1, feature => {
    const at = pointOf(feature);
    if (!at) return;
    const w: Waypoint = { ident: String(feature.properties.ident), ...at };
    openCard(<WaypointCard key={w.ident} waypoint={w} />);
  });
  return null;
}

function InViewWaypoints({ exclude }: { exclude: Set<string> }) {
  const { box, level } = useGlView();
  const query = waypointsQuery(box, level);
  const { data } = useQuery({ ...query, placeholderData: keepPreviousData });
  const shown = useMemo(() => (query.enabled ? (data ?? []).filter(w => !exclude.has(w.ident)) : []), [query.enabled, data, exclude]);
  const ready = usePictures();
  useGlLayer("marks", { [VFR]: empty() }, navaidMarks(VFR, { source: VFR }));
  const features = useMemo<GeoJSON.FeatureCollection | null>(() => (ready ? {
    type: "FeatureCollection", features: shown.map(w => point("vfr", w, `vfr-${w.ident}`)),
  } : null), [ready, shown]);
  useGlData(VFR, features);
  useGlProbe("navaid-marks", [VFR], f => ({ ident: f.properties.ident, kind: "vfr" }));
  const { openCard } = useGlMap();
  useGlTap([VFR], TAP.mark, TAP.rank.mark + 1, feature => {
    const w: Waypoint | undefined = shown.find(p => p.ident === feature.properties.ident);
    if (w) openCard(<WaypointCard key={w.ident} waypoint={w} />);
  });
  return null;
}
