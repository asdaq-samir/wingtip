import type { ExpressionSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { useMemo } from "react";
import { COURSE_MAGENTA } from "../../marks/chartColors";
import { WAY_CHIP_PLACE, WAY_SHARES, WAY_TEXT_SIZE, wayAt, wayChip, wayInk, type RouteWay } from "../../route/routeWays";
import { chipLayer, type Layout } from "../markLayers";
import { useGlLines, type GlRun } from "../useGlLines";
import { useGlSymbols, type GlSymbol } from "../useGlSymbols";
import { GL_FONT, GL_FONT_BOLD } from "./common";
import { CHART } from "../../../tokens";

/** A way's chip: its time in bold, and its name after it -- under it on
 *  the one shown, beside it on the others -- so each says which way it is
 *  (the owner's screenshot, 2026-11-16: three times piled up, none named). */
const wayChipLayer = (id: string, how: Parameters<typeof chipLayer>[2], shown: boolean, place: Layout): SymbolLayerSpecification => ({
  ...chipLayer(
    id,
    "route-way-chips",
    how,
    {
      "text-field": [
        "format",
        ["get", "label"],
        { "text-font": ["literal", GL_FONT_BOLD] },
        ["get", "gap"],
        {},
        ["get", "name"],
        { "text-font": ["literal", GL_FONT] },
      ] as ExpressionSpecification,
      "text-size": WAY_TEXT_SIZE,
      "text-line-height": 1.25,
      "text-justify": "left",
      ...WAY_CHIP_PLACE,
      ...place,
    },
    { "text-color": ["get", "ink"] as ExpressionSpecification },
  ),
  filter: ["==", ["get", "shown"], shown],
});

/** The shown way's chip's layer, which the route's own marks are drawn
 *  under (RouteGl) so they give way to it. */
export const WAY_SHOWN_LAYER = "route-way-chips";

/** The one shown always drawn, and in the way of the others; the others
 *  left out where they would fall on it or on each other, so no two chips
 *  pile up (MapLibre's collision). The shown one's layer is last, on top,
 *  and placed first: over the route's own marks too, whose names give way
 *  to it, where they were drawn over it and cut its words ("Avc FAINS
 *  ther", the UI audit's B6, 2026-11-17). */
const WAY_LAYERS: SymbolLayerSpecification[] = [
  wayChipLayer("route-way-chips-others", { collide: true, sort: 0 }, false, {}),
  wayChipLayer(WAY_SHOWN_LAYER, {}, true, { "icon-ignore-placement": false, "text-ignore-placement": false }),
];

/** FPL's Routes' ways beside the route: the one shown solid magenta, the
 *  others thin dotted lines in the chart's ink, as Maps greys the routes
 *  beside the one picked; each with its chip a tap picks. */
export function WaysGl({ ways, shown: shown_, onPick }: { ways: RouteWay[]; shown: string | null; onPick: (key: string) => void }) {
  const runs = useMemo<GlRun[]>(
    () => ways.filter((w) => w.key === shown_).map((w) => ({ points: w.path, colour: COURSE_MAGENTA, width: 7 })),
    [ways, shown_],
  );
  const others = useMemo<GlRun[]>(
    () => ways.filter((w) => w.key !== shown_).map((w) => ({ points: w.path, colour: CHART.fixInk, width: 3, opacity: 0.55 })),
    [ways, shown_],
  );
  useGlLines("route-ways", "lines", runs, null);
  useGlLines("route-ways-others", "lines", others, null, WAY_DOTS);
  const marks = useMemo<GlSymbol[]>(
    () =>
      ways.map((w, i) => {
        const [lat, lon] = wayAt(w.path, w.share ?? WAY_SHARES[i % WAY_SHARES.length]!);
        const shown = w.key === shown_;
        return {
          key: w.key,
          lat,
          lon,
          picture: wayChip(),
          // The name under the time only where there is a time: "As typed"
          // with no airplane has none, and its empty first line set the
          // name low in a chip twice its height.
          props: {
            label: w.label,
            name: mapWords(w.name ?? ""),
            gap: w.name && w.label ? (shown ? "\n" : " ") : "",
            shown,
            ink: wayInk(shown),
          },
          onTap: () => onPick(w.key),
        };
      }),
    [ways, shown_, onPick],
  );
  useGlSymbols("route-way-chips", WAY_LAYERS, marks);
  return null;
}

/** A way's name as the map writes words, in sentence case: its chip's
 *  title in the sheet, "Best Weather", is "Best weather" on the chart,
 *  an ident or a code in capitals kept ("Via KMSN"); docs/design/rules.md,
 *  the map's exception to decision 0021. */
const mapWords = (title: string) =>
  title
    .split(" ")
    .map((word, i) => (i > 0 && /^[A-Z][a-z]+$/.test(word) ? word.toLowerCase() : word))
    .join(" ");

/** The other ways' dots, in line widths: short dashes as far apart again. */
const WAY_DOTS = [1, 2];
