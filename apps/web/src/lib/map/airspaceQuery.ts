import { api } from "../api/client";
import type { AirspaceVolume } from "../api/types";
import type { Box } from "./view";

// The Class B, C and D as the map asks for them (AirspaceCard says what
// they are; lib/map/gl/layers/AirspaceGl draws them and opens the card).

/** From this zoom in, as the airports' and the VFR waypoints', the Class
 *  C and D and every label: further out they are a scatter of small rings
 *  over a few states. */
const FROM_ZOOM = 8;
/** The Class B's lines from a few states' zoom, as the airline airports'
 *  marks are (AirportsLayer), at the owner's ask (2026-10-29, "Maybe
 *  class B from 4?", then two levels in from that): the big rings a pilot
 *  plans round, there before anything else. Unlabelled until FROM_ZOOM. */
const CLASS_B_FROM_ZOOM = 6;
/** The Class C's lines a zoom before the D's, at the owner's ask
 *  (2026-10-29, "Show c airspace from 7"); unlabelled until FROM_ZOOM. */
const CLASS_C_FROM_ZOOM = 7;

/** The volumes already drawn, by their id and the box's height their
 *  lines were simplified for (the planner's tolerance_for): a pan into a
 *  new box answers with the same rings, and each kept as the same object
 *  is not projected again (AirspaceLinesLayer, by the object) nor its tap
 *  made again (VolumeTap is memo). New objects, every ring on the map was
 *  taken off its line and put back, its tap too, at each box a pan or a
 *  pinch asked for. */
const drawn = new Map<string, AirspaceVolume>();
/** The most kept, a few states' worth, before they are let go. */
const MOST_KEPT = 3000;

function kept(volumes: AirspaceVolume[], box: { south: number; north: number }): AirspaceVolume[] {
  if (drawn.size > MOST_KEPT) drawn.clear();
  const height = box.north - box.south;
  return volumes.map(v => {
    const key = `${v.id}|${height}`;
    const was = drawn.get(key);
    if (was) return was;
    drawn.set(key, v);
    return v;
  });
}

/** The planner asked for a box's volumes, once per box and classes (the
 *  query cache): the lines' layer, the altitudes and the taps share it,
 *  and the map's own events ask it as they happen (useAhead). The Class B
 *  from CLASS_B_FROM_ZOOM, the C too from CLASS_C_FROM_ZOOM and the D from
 *  FROM_ZOOM; none where the settings' Airspace is off. */
export function airspaceQuery(asked: Box, zoom: number, show: boolean) {
  const classes = zoom >= FROM_ZOOM ? "BCD" : zoom >= CLASS_C_FROM_ZOOM ? "BC" : "B";
  return {
    queryKey: ["airspaceInView", asked.key, classes],
    queryFn: () => api.airspaceInView({ ...asked.box, classes }).then(volumes => kept(volumes, asked.box)),
    enabled: show && zoom >= CLASS_B_FROM_ZOOM,
    staleTime: Infinity,
    meta: { silent: true },
  };
}
