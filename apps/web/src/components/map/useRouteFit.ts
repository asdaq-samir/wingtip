import type * as maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { Course } from "../../lib/api/types";
import type { MapInsets } from "../../lib/mapChrome";
import { FIT_MARGIN } from "../../lib/map/clear";
import { useOwnShip } from "../../lib/map/position/ownShip";
import { cameraOf } from "../../lib/map/gl/camera";

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
 * new room by the camera's owner (lib/map/gl/camera's room), as a point
 * picked is: the sheet's own ease of the padding, a second camera move,
 * stopped MapLibre's fit where it was, so
 * a destination typed as the keyboard went, or a stop as the sheet came
 * down, left the course half fitted, its end at the map's edge or under
 * the sheet (the owner, 2026-11-11: "it didn't center the course on the
 * map").
 */
export function useRouteFit(map: maplibregl.Map | null, course: Course | null, insets: RefObject<MapInsets>, duration: number) {
  const routeKey = course ? routePointsKey(course) : null;
  const routeBounds = useCallback((): [[number, number], [number, number]] | null => {
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
  // A route made, or asked for again from the location arrow: the pilot's
  // pick, so the map is the app's to fit, and every follow ends (the
  // camera's fit). Over the map's own padding, the room the panel leaves
  // (MapLibre adds the two): a margin, and the map's buttons cleared.
  const fit = useCallback(
    (animate: boolean) => {
      const bounds = routeBounds();
      if (!map || !bounds) return;
      cameraOf(map).fit(bounds, { margin: FIT_MARGIN, duration: animate ? duration : 0 });
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
    fit(true);
  }, [routeAsked, fit]);
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
}
