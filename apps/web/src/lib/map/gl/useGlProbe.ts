import type { MapGeoJSONFeature, MapSourceDataEvent } from "maplibre-gl";
import { useEffect, useEffectEvent } from "react";
import { useGlMap } from "./glLayer";

/**
 * What a layer has drawn, where, for the browser tests: an empty element
 * in the map's container carrying `data-<name>` as JSON -- each feature
 * drawn, its `fields` and its place in the map's own points -- written
 * each time the map is idle (data-airport-marks, data-navaid-marks), and
 * while it moves as tiles come in: a canvas drawn by WebGL has no
 * elements for a test to find.
 */
export function useGlProbe(name: string, layers: string[], fields: (f: MapGeoJSONFeature) => Record<string, unknown>) {
  const { map } = useGlMap();
  const pick = useEffectEvent(fields);
  const ids = layers.join();
  useEffect(() => {
    const el = document.createElement("div");
    el.hidden = true;
    el.dataset.glProbe = name;
    const attr = `data-${name}`;
    el.setAttribute(attr, "[]");
    map.getContainer().appendChild(el);
    const write = () => {
      const present = ids.split(",").filter((l) => map.getLayer(l));
      const seen = new Set<string>();
      const out: Record<string, unknown>[] = [];
      for (const f of present.length ? map.queryRenderedFeatures({ layers: present }) : []) {
        // A point where it is on the map, an area by the middle of its box (a
        // place to tap it), a line or a label by its fields alone.
        const at =
          f.geometry.type === "Point"
            ? map.project(f.geometry.coordinates as [number, number])
            : f.geometry.type === "Polygon"
              ? map.project(middleOf(f.geometry.coordinates[0] as [number, number][]))
              : // A line by a point on it: its middle vertex.
                f.geometry.type === "LineString"
                ? map.project(f.geometry.coordinates[Math.floor(f.geometry.coordinates.length / 2)] as [number, number])
                : null;
        const row: Record<string, unknown> = at ? { ...pick(f), x: Math.round(at.x * 10) / 10, y: Math.round(at.y * 10) / 10 } : pick(f);
        // An area's box on the map too, for a test to find a place inside
        // it, and a line's, for a test to see where it lies (the route
        // fitted clear of the sheet): the box of the piece the map drew.
        const outline =
          f.geometry.type === "Polygon"
            ? (f.geometry.coordinates[0] as [number, number][])
            : f.geometry.type === "LineString"
              ? (f.geometry.coordinates as [number, number][])
              : f.geometry.type === "MultiLineString"
                ? (f.geometry.coordinates.flat() as [number, number][])
                : null;
        if (outline) {
          const ring = outline.map((p) => map.project(p));
          row.box = [
            Math.min(...ring.map((p) => p.x)),
            Math.min(...ring.map((p) => p.y)),
            Math.max(...ring.map((p) => p.x)),
            Math.max(...ring.map((p) => p.y)),
          ].map((v) => Math.round(v));
        }
        const key = JSON.stringify(row);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
      }
      el.setAttribute(attr, JSON.stringify(out));
    };
    map.on("idle", write);
    // MapLibre fires no idle until a gesture ends (Map.isMoving counts a
    // finger held down after a pan), while the tiles that came in under it
    // are already drawn: written again a quarter second after one comes,
    // once its marks are placed (map.spec's airports under a finger's pan).
    let timer = 0;
    const came = (e: MapSourceDataEvent) => {
      if (!e.tile || timer || !map.isMoving()) return;
      timer = window.setTimeout(() => {
        timer = 0;
        write();
      }, 250);
    };
    map.on("sourcedata", came);
    return () => {
      map.off("idle", write);
      map.off("sourcedata", came);
      window.clearTimeout(timer);
      el.remove();
    };
  }, [map, name, ids]);
}

/** The middle of a ring's box, [lon, lat]. */
function middleOf(ring: [number, number][]): [number, number] {
  const lons = ring.map((p) => p[0]),
    lats = ring.map((p) => p[1]);
  return [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
}
