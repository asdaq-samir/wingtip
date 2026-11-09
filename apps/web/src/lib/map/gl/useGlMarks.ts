import type { Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { useGlMap } from "./glLayer";
import { declutter, declutterSoon } from "./declutter";
import { fadeInMarker, iconMarker, type IconLike } from "./htmlMarker";

export interface GlMark {
  key: string;
  lat: number;
  lon: number;
  icon: IconLike;
  /** A tap on it, when it is a target. */
  onTap?: () => void;
  onHover?: (on: boolean) => void;
  title?: string;
  /** The route's own marks give way by it, higher staying (declutter):
   *  none, a mark that keeps its place whatever is over it. */
  priority?: number;
  /** Moved a little off its point to clear a higher one, rather than left
   *  out (a top of climb's pill). */
  nudge?: boolean;
}

/**
 * Marks drawn as the app's own div icons (icons.ts), one MapLibre marker
 * each, kept by key and made again only as their icon changes: the few
 * dozen marks that are chips with words in them -- the Class B fields'
 * weather, a stop's pin, a top of climb -- where a symbol layer would
 * need a picture for each. The map places them in the frame it draws
 * the chart.
 */
export function useGlMarks(marks: GlMark[], fade = false) {
  const { map } = useGlMap();
  const kept = useRef(new Map<string, { marker: Marker; icon: IconLike; mark: GlMark; free?: () => void }>());
  useEffect(() => {
    const seen = new Set<string>();
    let moved = false;
    for (const mark of marks) {
      seen.add(mark.key);
      const was = kept.current.get(mark.key);
      if (was && was.icon === mark.icon && was.mark.priority === mark.priority) {
        const at = was.marker.getLngLat();
        if (at.lng !== mark.lon || at.lat !== mark.lat) moved = true;
        was.marker.setLngLat([mark.lon, mark.lat]);
        was.mark = mark;
        continue;
      }
      was?.free?.();
      was?.marker.remove();
      const marker = iconMarker(mark.icon, { interactive: !!mark.onTap }).setLngLat([mark.lon, mark.lat]).addTo(map);
      const free =
        mark.priority === undefined
          ? undefined
          : declutter(map, { marker, priority: mark.priority, offset: [marker.getOffset().x, marker.getOffset().y], nudge: mark.nudge });
      // A new mark of what changes (the weather's) faded in, not snapped on.
      if (fade && !was) fadeInMarker(marker);
      const el = marker.getElement();
      if (mark.title) el.title = mark.title;
      const entry = { marker, icon: mark.icon, mark, free };
      if (mark.onTap) {
        el.style.cursor = "pointer";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          entry.mark.onTap?.();
        });
      }
      el.addEventListener("mouseenter", () => entry.mark.onHover?.(true));
      el.addEventListener("mouseleave", () => entry.mark.onHover?.(false));
      kept.current.set(mark.key, entry);
    }
    for (const [key, { marker, free }] of kept.current) {
      if (!seen.has(key)) {
        free?.();
        marker.remove();
        kept.current.delete(key);
      }
    }
    if (moved) declutterSoon(map);
  }, [map, marks, fade]);
  useEffect(() => {
    const all = kept.current;
    return () => {
      for (const { marker, free } of all.values()) {
        free?.();
        marker.remove();
      }
      all.clear();
    };
  }, [map]);
}
