import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ChartInfo } from "../../../../lib/api/types";
import { usePreferences } from "../../../../lib/preferences";
import { classBQuery } from "../../../../lib/queryClient";
import { useAhead } from "../../../../lib/map/position/ahead";
import { colourOf } from "../../../../lib/map/marks/flightCategory";
import { airportMarkIcon } from "../../../../lib/map/marks/icons";
import { useOwnShip } from "../../../../lib/map/position/ownShip";
import { chartPair, sheetAt } from "../../../../lib/map/sources/tiles";
import { useGlMap } from "../../../../lib/map/gl/glLayer";
import { glZoom } from "../../../../lib/map/gl/glStyle";
import type { IconLike } from "../../../../lib/map/gl/htmlMarker";
import { useGlMarks, type GlMark } from "../../../../lib/map/gl/useGlMarks";
import { useGlLines, type GlRun } from "../../../../lib/map/gl/useGlLines";
import { CHART } from "../../../../lib/tokens";

/**
 * The Class B fields' weather, as chips over the chart, at
 * the settings' Class B Weather: a tap the field's card; a hover shows the
 * terminal sheet over it while the pointer is there.
 */
export function ClassBGl({
  chart,
  route,
  onPreview,
  onSelectPlace,
}: {
  chart: ChartInfo;
  route: string[];
  onPreview: (on: boolean) => void;
  onSelectPlace?: (ident: string) => void;
}) {
  const { map } = useGlMap();
  const show = usePreferences((s) => s.classB);
  const base = usePreferences((s) => s.base);
  const { overlay } = chartPair(chart.chart_layers, base);
  const overlayFromZoom = overlay?.min_zoom ?? 10;
  const { data } = useQuery({ ...classBQuery, enabled: show });
  const marks = useMemo<GlMark[]>(
    () =>
      show && data
        ? data
            .filter((a) => !route.includes(a.ident))
            .map((a) => {
              const sheet = sheetAt(overlay, a.lat, a.lon);
              return {
                key: a.ident,
                lat: a.lat,
                lon: a.lon,
                icon: airportMarkIcon(a.ident, "B", colourOf(a.flight_category)),
                title: `${a.ident} · ${a.name} · ${a.flight_category ?? "no report"}`,
                onHover: (on) => onPreview(on && !!sheet),
                onTap: () => {
                  onPreview(false);
                  if (onSelectPlace) onSelectPlace(a.ident);
                  else map.flyTo({ center: [a.lon, a.lat], zoom: Math.max(map.getZoom(), glZoom(overlayFromZoom)), duration: 600 });
                },
              };
            })
        : [],
    [show, data, route, overlay, overlayFromZoom, onPreview, onSelectPlace, map],
  );
  useGlMarks(marks);
  return null;
}

/**
 * What is ahead of own ship in the air (lib/map/position/ahead): each
 * alert's point ringed in its level's colour, a dashed line out to it
 * from own ship where it is not already inside.
 */
/** The alerts' inks: a warning red, a caution amber. */
const AHEAD_INK = { warning: CHART.warning, caution: CHART.caution } as const;

export function AheadGl() {
  const ahead = useAhead();
  const fix = useOwnShip((s) => s.fix);
  const runs = useMemo<GlRun[] | null>(
    () =>
      ahead && fix
        ? ahead.alerts.flatMap((a) => [
            ...(!a.inside
              ? [
                  {
                    points: [
                      [fix.lat, fix.lon],
                      [a.lat, a.lon],
                    ] as [number, number][],
                    colour: AHEAD_INK[a.level],
                    width: 2,
                  },
                ]
              : []),
          ])
        : null,
    [ahead, fix],
  );
  useGlLines("ahead", "top", runs, null, [3, 3]);
  const rings = useMemo<GlMark[]>(
    () => (ahead && fix ? ahead.alerts.map((a) => ({ key: a.id, lat: a.lat, lon: a.lon, icon: aheadIcon(a.level) })) : []),
    [ahead, fix],
  );
  useGlMarks(rings);
  return null;
}

const aheadIcons = new Map<string, IconLike>();
/** An alert's ring, a circle in its level's colour over a wash. */
function aheadIcon(level: "warning" | "caution"): IconLike {
  let icon = aheadIcons.get(level);
  if (!icon) {
    // The wash: the ink at a quarter (an 8-digit hex's alpha, 0x40).
    const line = AHEAD_INK[level];
    const fill = `${line}40`;
    icon = {
      options: {
        className: `ahead-${level}`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        html: `<span style="position:absolute;inset:0;border-radius:9999px;border:3px solid ${line};background:${fill}"></span>`,
      },
    };
    aheadIcons.set(level, icon);
  }
  return icon;
}
