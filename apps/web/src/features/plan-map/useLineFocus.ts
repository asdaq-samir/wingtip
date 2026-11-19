import { useEffect, useEffectEvent } from "react";
import type { Course } from "../../lib/api/types";
import { coursePoints } from "../../lib/course";
import { useMapInsets, useSlidingSheet } from "../../lib/mapChrome";
import { useRouteOnly } from "../../lib/map/routeOnly";
import { useGlMap } from "../../lib/map/gl/glLayer";
import { cameraOf } from "../../lib/map/gl/camera";
import { glZoom } from "../../lib/map/gl/glStyle";
import { sameField } from "../../lib/procedures";
import { PICK_ZOOM } from "../../lib/map/mapPick";
import { padOf } from "../../components/map/makeMap";
import { DRAWER_MS } from "../../components/sheet/insets";
import { drawerEasing } from "../../components/map/drawerEasing";

/**
 * The point of FPL's timeline whose line is open (lib/map/routeOnly's
 * `focus`) centred in the map above the half sheet, as an airport's card
 * centres its field as it opens (GlMapShell): once each time a line opens,
 * on the sheet's curve and time, the pilot's zoom kept where it is closer.
 */
export function useLineFocus(course: Course | null) {
  const { map } = useGlMap();
  const focus = useRouteOnly((s) => s.focus);
  // Once a line opened: the course planned again under it moves nothing.
  const centre = useEffectEvent((ident: string) => {
    if (!map || !course) return;
    const point = coursePoints(course).find((p) => sameField(p.ident, ident));
    if (!point) return;
    const half = useSlidingSheet.getState().half;
    cameraOf(map).pick([point.lon, point.lat], {
      zoom: Math.max(map.getZoom(), glZoom(PICK_ZOOM)),
      pad: { ...padOf(useMapInsets.getState()), ...(half ? { bottom: half } : {}) },
      duration: DRAWER_MS,
      easing: drawerEasing,
    });
  });
  useEffect(() => {
    if (focus) centre(focus);
  }, [map, focus]);
}
