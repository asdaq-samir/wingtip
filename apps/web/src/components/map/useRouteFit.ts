import type * as maplibregl from "maplibre-gl";
import type { LngLatBoundsLike, PaddingOptions } from "maplibre-gl";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { Course } from "../../lib/api/types";
import type { MapInsets } from "../../lib/mapChrome";
import { FIT_MARGIN } from "../../lib/map/clear";
import { useOwnShip } from "../../lib/map/position/ownShip";
import { picked } from "../../lib/map/gl/pilotCamera";
import { DRAWER_MS } from "../sheet/insets";
import { drawerEasing } from "./drawerEasing";

/** The least the map is fitted to round a route, ~10 nm. */
const MIN_FIT_DEG = 0.08;

/** The route's points, in order: what a change of fits the map again. A
 *  stop put in, taken out or moved is a new route as much as a new end
 *  is; its altitudes, procedures or a detour round the line are not. */
const routePointsKey = (course: Course) => [course.departure, ...(course.stops ?? []), course.destination].map((p) => p.ident).join(">");

/**
 * The map fitted to the route (GlMapShell's): once for each set of the
 * route's points -- made, a stop put in or taken out, an end changed --
 * and again from the location arrow; clear of the panel and the map's
 * buttons; and whether the route is out of sight, for the arrow to offer
 * it back.
 *
 * A fit still flying when the sheet turns is aimed again at the sheet's
 * new room (what it answers), as a point picked is: the sheet's own ease of the
 * padding, a second camera move, stopped MapLibre's fit where it was, so
 * a destination typed as the keyboard went, or a stop as the sheet came
 * down, left the course half fitted, its end at the map's edge or under
 * the sheet (the owner, 2026-11-11: "it didn't center the course on the
 * map").
 */
export function useRouteFit(
  map: maplibregl.Map | null,
  course: Course | null,
  insets: RefObject<MapInsets>,
  padOf: (insets: MapInsets) => Required<PaddingOptions>,
  duration: number,
) {
  const routeKey = course ? routePointsKey(course) : null;
  const routeBounds = useCallback((): LngLatBoundsLike | null => {
    if (!course) return null;
    const line = course.course_line as [number, number][];
    const lats = line.map((p) => p[0]),
      lons = line.map((p) => p[1]);
    const pad = MIN_FIT_DEG / 2;
    return [
      [Math.min(...lons) - pad, Math.min(...lats) - pad],
      [Math.max(...lons) + pad, Math.max(...lats) + pad],
    ];
  }, [course]);
  // The bounds of a fit still flying, for the sheet turning under it.
  const fitting = useRef<LngLatBoundsLike | null>(null);
  // A route made, or asked for again from the location arrow: the pilot's
  // pick, so the map is the app's to fit (lib/map/gl/pilotCamera).
  const fit = useCallback(
    (animate: boolean) => {
      const bounds = routeBounds();
      if (!map || !bounds) return;
      picked();
      const ownShip = useOwnShip.getState();
      if (ownShip.enabled && ownShip.follow) ownShip.setFollow(false);
      fitting.current = animate ? bounds : null;
      // Over the map's own padding, the room the panel leaves (MapLibre adds
      // the two): a margin, and the map's buttons cleared.
      map.fitBounds(bounds, { padding: FIT_MARGIN, duration: animate ? duration : 0 });
    },
    [map, routeBounds, duration],
  );
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (!routeKey) {
      fitted.current = null;
      return;
    }
    if (!map || fitted.current === routeKey) return;
    fit(fitted.current !== null);
    fitted.current = routeKey;
  }, [map, routeKey, fit]);
  // The whole route again, from the location arrow (MyPositionButton).
  const routeAsked = useOwnShip((s) => s.routeAsked);
  const routeAskedWas = useRef(routeAsked);
  useEffect(() => {
    if (routeAsked === routeAskedWas.current) return;
    routeAskedWas.current = routeAsked;
    useOwnShip.getState().setFollow(false);
    fit(true);
  }, [routeAsked, fit]);
  // The fit let go once the map is at rest, or the pilot moves it by hand.
  // Not at the moveend a fit aimed again fires: MapLibre stops the old one
  // and starts the new in the same call, so the map is moving again by the
  // next microtask.
  useEffect(() => {
    if (!map) return;
    const rested = () =>
      queueMicrotask(() => {
        if (!map.isMoving()) fitting.current = null;
      });
    const byHand = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) fitting.current = null;
    };
    map.on("moveend", rested);
    map.on("movestart", byHand);
    return () => {
      map.off("moveend", rested);
      map.off("movestart", byHand);
    };
  }, [map]);
  useEffect(() => {
    useOwnShip.setState({ routeDrawn: !!course && !!map });
    return () => {
      useOwnShip.setState({ routeDrawn: false, routeOutOfView: false });
    };
  }, [course, map]);
  // Whether the route is out of sight at each rest, for the location
  // arrow to offer it back.
  useEffect(() => {
    if (!map || !course) return;
    const line = course.course_line as [number, number][];
    const check = () => {
      const { top, bottom, left } = insets.current;
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      const out = line.some(([lat, lon]) => {
        const p = map.project([lon, lat]);
        return p.x < left - 8 || p.x > w + 8 || p.y < top - 8 || p.y > h - bottom + 8;
      });
      if (useOwnShip.getState().routeOutOfView !== out) useOwnShip.setState({ routeOutOfView: out });
    };
    check();
    map.on("moveend", check);
    return () => {
      map.off("moveend", check);
    };
  }, [map, course, insets]);

  /** The fit still flying aimed again at the room the sheet leaves at `to`,
   *  in the sheet's time, the map's padding eased to that room with it:
   *  true where there was one to aim. The camera is asked for with the
   *  margin over the new room (MapLibre's absolutePadding), not over the
   *  padding the map is part way through; its middle is the room's own, the
   *  margin being the same either side (FIT_MARGIN), so the map keeps the
   *  sheet's padding alone, as follow() leaves it. */
  const again = useCallback(
    (to: MapInsets) => {
      const bounds = fitting.current;
      if (!map || !bounds || !map.isMoving()) return false;
      const room = padOf(to);
      const camera = map.cameraForBounds(bounds, {
        padding: {
          top: room.top + FIT_MARGIN.top,
          bottom: room.bottom + FIT_MARGIN.bottom,
          left: room.left + FIT_MARGIN.left,
          right: room.right + FIT_MARGIN.right,
        },
        absolutePadding: true,
      });
      if (!camera) return false;
      map.easeTo({ center: camera.center, zoom: camera.zoom, padding: room, duration: DRAWER_MS, easing: drawerEasing });
      return true;
    },
    [map, padOf],
  );
  return again;
}
