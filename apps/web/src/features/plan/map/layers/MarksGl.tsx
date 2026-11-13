import type { CircleLayerSpecification } from "maplibre-gl";
import { useMemo } from "react";
import { useAhead } from "../../../../lib/map/position/ahead";
import { useOwnShip } from "../../../../lib/map/position/ownShip";
import { EMPTY, useGlData, useGlLayer } from "../../../../lib/map/gl/glLayer";
import { useGlProbe } from "../../../../lib/map/gl/useGlProbe";
import { useGlLines, type GlRun } from "../../../../lib/map/gl/useGlLines";
import { CHART } from "../../../../lib/tokens";

/**
 * What is ahead of own ship in the air (lib/map/position/ahead): each
 * alert's point ringed in its level's colour, a dashed line out to it
 * from own ship where it is not already inside.
 */
/** The alerts' inks: a warning red, a caution amber. */
const AHEAD_INK = { warning: CHART.warning, caution: CHART.caution } as const;

export function AheadGl() {
  const ahead = useAhead();
  // The fix only where a line is drawn to an alert outside it, else
  // whether there is one: the rings stand still while the airplane moves,
  // and were sent to the map's worker again at every fix.
  const lined = !!ahead?.alerts.some((a) => !a.inside);
  const fix = useOwnShip((s) => (lined ? s.fix : null));
  const hasFix = useOwnShip((s) => s.fix !== null);
  const runs = useMemo<GlRun[] | null>(
    () =>
      ahead && fix
        ? ahead.alerts
            .filter((a) => !a.inside)
            .map((a) => ({
              points: [
                [fix.lat, fix.lon],
                [a.lat, a.lon],
              ] as [number, number][],
              colour: AHEAD_INK[a.level],
              width: 2,
            }))
        : null,
    [ahead, fix],
  );
  useGlLines("ahead", "top", runs, null, [3, 3]);
  useGlLayer("top", { [AHEAD]: { type: "geojson", data: EMPTY } }, [AHEAD_RINGS]);
  const rings = useMemo<GeoJSON.FeatureCollection | null>(
    () =>
      ahead && hasFix
        ? {
            type: "FeatureCollection",
            features: ahead.alerts.map((a) => ({
              type: "Feature",
              properties: { id: a.id, level: a.level },
              geometry: { type: "Point", coordinates: [a.lon, a.lat] },
            })),
          }
        : null,
    [ahead, hasFix],
  );
  useGlData(AHEAD, rings);
  // The rings drawn, by level, for the browser tests.
  useGlProbe("ahead-rings", [AHEAD], (f) => ({ level: f.properties.level }));
  return null;
}

const AHEAD = "ahead-rings";
/** An alert's ring, a circle in its level's colour over a wash of it (a
 *  quarter of the ink), 22 points across. */
const AHEAD_RINGS: CircleLayerSpecification = {
  id: AHEAD,
  type: "circle",
  source: AHEAD,
  paint: {
    "circle-radius": 9.5,
    "circle-color": ["match", ["get", "level"], "warning", AHEAD_INK.warning, AHEAD_INK.caution],
    "circle-opacity": 0.25,
    "circle-stroke-color": ["match", ["get", "level"], "warning", AHEAD_INK.warning, AHEAD_INK.caution],
    "circle-stroke-width": 3,
  },
};
