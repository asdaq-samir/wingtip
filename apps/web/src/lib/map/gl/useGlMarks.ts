import type { Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { useGlMap } from "./glLayer";
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
  const kept = useRef(new Map<string, { marker: Marker; icon: IconLike; mark: GlMark }>());
  useEffect(() => {
    const seen = new Set<string>();
    for (const mark of marks) {
      seen.add(mark.key);
      const was = kept.current.get(mark.key);
      if (was && was.icon === mark.icon) {
        was.marker.setLngLat([mark.lon, mark.lat]);
        was.mark = mark;
        continue;
      }
      was?.marker.remove();
      const marker = iconMarker(mark.icon, { interactive: !!mark.onTap }).setLngLat([mark.lon, mark.lat]).addTo(map);
      // A new mark of what changes (the weather's) faded in, not snapped on.
      if (fade && !was) fadeInMarker(marker);
      const el = marker.getElement();
      if (mark.title) el.title = mark.title;
      const entry = { marker, icon: mark.icon, mark };
      if (mark.onTap) {
        el.style.cursor = "pointer";
        el.addEventListener("click", e => { e.stopPropagation(); entry.mark.onTap?.(); });
      }
      el.addEventListener("mouseenter", () => entry.mark.onHover?.(true));
      el.addEventListener("mouseleave", () => entry.mark.onHover?.(false));
      kept.current.set(mark.key, entry);
    }
    for (const [key, { marker }] of kept.current) {
      if (!seen.has(key)) {
        marker.remove();
        kept.current.delete(key);
      }
    }
  }, [map, marks, fade]);
  useEffect(() => {
    const all = kept.current;
    return () => { for (const { marker } of all.values()) marker.remove(); all.clear(); };
  }, [map]);
}
