import { useMemo } from "react";
import { useGlMarks, type GlMark } from "../../../../lib/map/gl/useGlMarks";
import { dotIcon } from "../../../../lib/map/marks/icons";
import { MAP_BLUE } from "../../../../lib/map/marks/chartColors";
import { setSearchHot, useSearchMarks } from "../../../../lib/map/marks/searchMarks";
import { CHART } from "../../../../lib/tokens";

/**
 * The one search's airports as numbered marks on a desktop's map while its
 * results are up (docs/design/web.md §1, as Google Maps numbers a search's
 * pins): each its number in the list, in the tint a tap is; the one under
 * the pointer -- here or on its row -- in the selection's yellow, and a
 * click opens its card, as its row does. Over the chart's own marks, so a
 * result is never under them.
 */
export function SearchMarksGl() {
  const marks = useSearchMarks((s) => s.marks);
  const hot = useSearchMarks((s) => s.hot);
  const drawn = useMemo<GlMark[]>(
    () =>
      marks.map((m) => ({
        key: `search-${m.ident}`,
        lat: m.lat,
        lon: m.lon,
        icon: dotIcon(m.ident === hot ? CHART.selected : MAP_BLUE, m.n),
        title: `${m.n}. ${m.ident}`,
        onTap: () => useSearchMarks.getState().open?.(m.ident),
        onHover: (on) => setSearchHot(on ? m.ident : null),
      })),
    [marks, hot],
  );
  useGlMarks(drawn);
  return null;
}
