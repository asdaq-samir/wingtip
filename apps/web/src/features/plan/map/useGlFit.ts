import { useEffect, useEffectEvent, useRef } from "react";
import { SHEET_SECONDS, useMapInsets } from "../../../lib/mapChrome";
import { useGlMap } from "../../../lib/map/gl/glLayer";
import { glZoom } from "../../../lib/map/gl/glStyle";
import { picked, pilotMoved } from "../../../lib/map/gl/pilotCamera";
import { cameraOf } from "../../../lib/map/gl/camera";
import { FIT_MARGIN } from "../../../lib/map/clear";

/**
 * The map fitted to `points`, clear of the panel and the map's buttons,
 * flown there in the sheet's time, once for each thing the pilot picks
 * (`subject`: Nearest opened, a leg, a procedure or a pattern picked, the
 * Stops, a search sent, a past flight): a pick is when the map is the
 * app's to move (lib/map/gl/pilotCamera). The points that come or change
 * after -- the list refreshed, own ship moving Nearest's fields, a
 * search's results arriving after the pilot moved the map -- never move
 * it again, as Apple Maps leaves a map the pilot has in hand. A subject
 * `held` (the card a pick opened flies the map itself) counts as fitted.
 * Not past `maxZoom`, in the app's levels. Fitted by the camera's owner
 * (lib/map/gl/camera): every follow ends, as a route's fit ends it, and a
 * single point is brought into sight only if it is out of the room, not
 * fitted as a box of no size (the flicker audit's FL-20).
 */
export function useGlFit(
  points: { lat: number; lon: number }[],
  subject: string | null,
  maxZoom = 11,
  cover = { top: 0, bottom: 0 },
  held = false,
) {
  const { map } = useGlMap();
  const insetTop = useMapInsets((i) => i.top);
  const insetBottom = useMapInsets((i) => i.bottom);
  // Over the map's own padding (the panel's room, which MapLibre adds):
  // what a sheet over the panel covers beyond it.
  const top = Math.max(0, cover.top - insetTop),
    bottom = Math.max(0, cover.bottom - insetBottom);
  // The subject last picked, and the one fitted (or let go).
  const seen = useRef<string | null>(null);
  const fitted = useRef<string | null>(null);
  const fit = useEffectEvent(() => {
    if (subject !== seen.current) {
      seen.current = subject;
      // A new subject is the pilot's pick: the map is the app's again.
      if (subject) picked();
      else fitted.current = null;
    }
    if (!subject || fitted.current === subject) return;
    if (held) {
      fitted.current = subject;
      return;
    }
    if (points.length === 0) return;
    fitted.current = subject;
    // Moved by hand while the points were coming: left where the pilot put it.
    if (pilotMoved()) return;
    const lats = points.map((p) => p.lat),
      lons = points.map((p) => p.lon);
    cameraOf(map).fit(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      {
        margin: { ...FIT_MARGIN, top: FIT_MARGIN.top + top, bottom: FIT_MARGIN.bottom + bottom },
        maxZoom: glZoom(maxZoom),
        duration: SHEET_SECONDS * 2000,
      },
    );
  });
  // Again as the subject or its points come: fitted once a subject.
  useEffect(() => fit(), [map, subject, points, held]);
}
