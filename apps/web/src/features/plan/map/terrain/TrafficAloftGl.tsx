import { MercatorCoordinate, type CustomLayerInterface } from "maplibre-gl";
import { useEffect, useMemo } from "react";
import type { TrafficAircraft } from "../../../../lib/api/types";
import { slotId, useGlMap } from "../../../../lib/map/gl/glLayer";
import { TRAFFIC_COLOURS, trafficIcon, trafficTag } from "../../../../lib/map/marks/icons";
import { useOwnFix } from "../../../../lib/map/position/ownShip";
import { useTracking } from "../../../../lib/map/position/tracking";
import { usePreferences } from "../../../../lib/preferences";
import { CARRY_S, carriedOn, markTraffic, nearOwnHeight, trafficLabel } from "../traffic";
import { inFrame, standAtM, toScreen, worldPoint, worldPxAt } from "./trafficAloft";

const LAYER = "traffic-aloft";
/** How often the airplanes are carried on along their tracks, ms: the
 *  2D map's own step close in (TrafficGl's FRAME_MS, doubled). */
const STEP_MS = 200;
/** The mark's box, px: the 2D map's (icons.ts TRAFFIC_MARK). */
const MARK = 16;

interface Drawn {
  plane: TrafficAircraft;
  at: number;
  el: HTMLDivElement;
  icon: HTMLDivElement;
  rotation: number | null;
  line: SVGLineElement;
}

/**
 * The traffic in 3D (TerrainGl mounts it while the traffic is drawn): each
 * airplane at its reported height over where it is, the 2D map's own mark
 * and its words -- the height against own ship's in hundreds as TCAS
 * writes it, "+12" 1,200 ft above (traffic.ts trafficLabel, the engine's
 * traffic_marks) -- with a thin line down to the ground under it, so its
 * height reads against the hills and the runway. MapLibre places no mark
 * in the air, so a custom layer hands over each frame's camera and the
 * marks are placed by it (trafficAloft's toScreen); the 2D marks on the
 * ground are hidden meanwhile (`data-traffic-aloft`, index.css). A tap on
 * one tracks it, as on the 2D map. The heights are as the feed sends them
 * (trafficAloft: geometric, else pressure set on the nearest altimeter).
 */
export default function TrafficAloftGl() {
  const on = usePreferences((s) => s.traffic);
  const tracking = useTracking((s) => !!s.hex || s.listing);
  return on || tracking ? <Aloft /> : null;
}

function Aloft() {
  const { map } = useGlMap();
  const seen = useTracking((s) => s.seen);
  const hex = useTracking((s) => s.hex);
  const ownFt = useOwnFix()?.altitudeFt ?? null;

  // The overlay: the drop lines in one SVG under the marks, over the map.
  const overlay = useMemo(() => {
    const root = document.createElement("div");
    root.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.cssText = "position:absolute;inset:0";
    root.append(svg);
    return { root, svg, drawn: new Map<string, Drawn>() };
  }, []);

  useEffect(() => {
    const container = map.getCanvasContainer();
    container.append(overlay.root);
    const el = map.getContainer();
    el.dataset.trafficAloft = "";
    const draw = (matrix: ArrayLike<number>) => {
      const canvas = map.getCanvas();
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      const now = Date.now();
      const bearing = map.getBearing();
      const world = worldPxAt(map.getZoom());
      let shown = 0;
      for (const d of overlay.drawn.values()) {
        const age = (now - d.at) / 1000;
        const { lat, lon } = carriedOn(d.plane, age);
        const groundM = map.queryTerrainElevation([lon, lat]) ?? 0;
        const at = MercatorCoordinate.fromLngLat([lon, lat]);
        const top = toScreen(matrix, worldPoint(at, world, standAtM(d.plane.altitude_ft, groundM)), w, h);
        const foot = toScreen(matrix, worldPoint(at, world, groundM), w, h);
        const visible = age <= CARRY_S && top !== null && inFrame(top, w, h);
        d.el.style.display = visible ? "" : "none";
        d.line.style.display = visible && foot ? "" : "none";
        if (!visible || !top) continue;
        shown += 1;
        d.el.style.transform = `translate(${top.x - MARK / 2}px, ${top.y - MARK / 2}px)`;
        if (d.rotation != null) d.icon.style.transform = `rotate(${d.rotation - bearing}deg)`;
        if (foot) {
          d.line.setAttribute("x1", String(top.x));
          d.line.setAttribute("y1", String(top.y));
          d.line.setAttribute("x2", String(foot.x));
          d.line.setAttribute("y2", String(foot.y));
        }
      }
      el.dataset.trafficAloft = String(shown);
    };
    // A layer that draws nothing itself: it is handed each frame's camera,
    // after the 3D ground, and places the marks by it.
    const layer: CustomLayerInterface = {
      id: LAYER,
      type: "custom",
      renderingMode: "3d",
      render: (_gl, args) => draw(args.modelViewProjectionMatrix),
    };
    map.addLayer(layer, slotId("top"));
    const timer = window.setInterval(() => map.triggerRepaint(), STEP_MS);
    return () => {
      window.clearInterval(timer);
      overlay.root.remove();
      delete el.dataset.trafficAloft;
      if (map.style && map.getLayer(LAYER)) map.removeLayer(LAYER);
    };
  }, [map, overlay]);

  // Each answer's airplanes, their marks and words made again as it comes
  // or own ship's height changes, not each frame.
  useEffect(() => {
    const planes = seen.map((r) => r.plane);
    markTraffic(planes, ownFt);
    const keep = new Set<string>();
    for (const { plane, at } of seen) {
      keep.add(plane.hex);
      const tracked = plane.hex === hex;
      const colour = nearOwnHeight(plane, ownFt) ? TRAFFIC_COLOURS.near : TRAFFIC_COLOURS.far;
      const icon = trafficIcon(plane.track_deg ?? null, colour, 0, tracked);
      const words = trafficTag(
        colour,
        trafficLabel(plane, ownFt),
        tracked ? (plane.callsign ?? plane.registration ?? null) : null,
        tracked,
      );
      let d = overlay.drawn.get(plane.hex);
      if (!d) {
        d = make(plane, at, () => useTracking.getState().pick?.(plane.hex, overlay.drawn.get(plane.hex)?.plane));
        overlay.root.append(d.el);
        overlay.svg.append(d.line);
        overlay.drawn.set(plane.hex, d);
      }
      d.plane = plane;
      d.at = at;
      d.rotation = icon.options.rotation ?? null;
      d.icon.innerHTML = String(icon.options.html ?? "");
      d.el.lastElementChild!.innerHTML = String(words.options.html ?? "");
      d.line.setAttribute("stroke", colour);
    }
    for (const [key, d] of overlay.drawn) {
      if (keep.has(key)) continue;
      d.el.remove();
      d.line.remove();
      overlay.drawn.delete(key);
    }
    map.triggerRepaint();
  }, [map, overlay, seen, ownFt, hex]);
  return null;
}

/** An airplane's elements: its mark, turned to its track, and its words
 *  upright under it; and its drop line. */
function make(plane: TrafficAircraft, at: number, onTap: () => void): Drawn {
  const el = document.createElement("div");
  el.style.cssText = `position:absolute;left:0;top:0;width:${MARK}px;height:${MARK}px;will-change:transform`;
  el.dataset.trafficAloftMark = plane.hex;
  const icon = document.createElement("div");
  icon.style.cssText = `position:absolute;inset:0;pointer-events:auto;cursor:pointer`;
  icon.addEventListener("click", (e) => {
    e.stopPropagation();
    onTap();
  });
  const tag = document.createElement("div");
  tag.style.cssText = "position:absolute;inset:0;pointer-events:none";
  el.append(icon, tag);
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("stroke-width", "1");
  line.setAttribute("stroke-opacity", "0.8");
  return { plane, at, el, icon, rotation: null, line };
}
