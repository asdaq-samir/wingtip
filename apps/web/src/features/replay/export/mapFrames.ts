import { restoreNow, setNow, type Map as MlMap } from "maplibre-gl";
import { TRAFFIC_COLOURS, trafficIcon } from "../../../lib/map/marks/icons";
import type { ReplayPoint } from "../../../lib/replay/clock";
import { LAYOUT_SHORT_PX } from "./exportOptions";

/** How long a frame waits for the map's tiles, ms, before it is drawn
 *  with what has come: a tile server that does not answer slows the
 *  export, and does not stop it. */
const TILE_WAIT_MS = 15_000;

const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

/**
 * The map made the video's size for the export and put back after: laid
 * out at LAYOUT_SHORT_PX on its short side (fixed to the window's corner,
 * under the export's sheet) and drawn at the video's pixels by its pixel
 * ratio; MapLibre's clock frozen (setNow, made for frame-by-frame video
 * export, maplibre-gl-js #6544) so a fade or a transition moves exactly a
 * frame's time each frame.
 */
export async function withMapSized<T>(map: MlMap, size: { width: number; height: number }, run: () => Promise<T>): Promise<T> {
  const el = map.getContainer();
  const before = el.style.cssText;
  const ratio = Math.min(size.width, size.height) / LAYOUT_SHORT_PX;
  el.style.cssText = `${before};position:fixed;left:0;top:0;width:${size.width / ratio}px;height:${size.height / ratio}px`;
  map.setPixelRatio(ratio);
  map.resize();
  try {
    return await run();
  } finally {
    restoreNow();
    el.style.cssText = before;
    map.setPixelRatio(window.devicePixelRatio);
    map.resize();
  }
}

/** Waits till the map's tiles are in (the 3D ground's among them) or
 *  TILE_WAIT_MS has passed; true if they all came. */
async function tilesIn(map: MlMap): Promise<boolean> {
  const until = performance.now() + TILE_WAIT_MS;
  for (;;) {
    await nextFrame();
    if (map.areTilesLoaded() && !map.isMoving()) return true;
    if (performance.now() > until) return false;
  }
}

/**
 * One frame of the map drawn into `out` (the video's size): MapLibre's
 * clock set to the frame's (`nowMs`), the replay put at its moment and the
 * camera moved (`place`), two screen frames let pass for the layers to
 * take it, the tiles waited for, then the map drawn once more and copied
 * the moment it is (in the render event, before the browser clears the
 * WebGL picture). Whether every tile had come is answered.
 */
export async function drawMapFrame(map: MlMap, nowMs: number, place: () => void, out: CanvasRenderingContext2D): Promise<boolean> {
  setNow(nowMs);
  place();
  await nextFrame();
  await nextFrame();
  const complete = await tilesIn(map);
  await new Promise<void>((resolve) => {
    map.once("render", () => {
      out.drawImage(map.getCanvas(), 0, 0, out.canvas.width, out.canvas.height);
      resolve();
    });
    map.triggerRepaint();
  });
  return complete;
}

const pictures = new Map<string, HTMLImageElement>();

/** A mark's SVG as a picture to draw on a canvas, made once. */
async function pictureOf(svg: string): Promise<HTMLImageElement> {
  const kept = pictures.get(svg);
  if (kept) return kept;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  if (pictures.size > 64) pictures.clear();
  pictures.set(svg, img);
  return img;
}

/**
 * The replay's airplane drawn on a frame where the map's own (ReplayGl)
 * is: that one is an HTML marker over the canvas, which a copy of the
 * canvas does not have. The same mark (trafficIcon), at the same place
 * (the map's projection of its position, on the 3D ground as the marker
 * is), turned to its track on the map.
 *
 * TODO(claude/studio): a ScenegraphLayer airplane at its altitude
 * (features/replay's seam), drawn by deck.gl into the map's canvas once
 * @deck.gl/maplibre is in; this then goes.
 */
export async function drawAirplane(map: MlMap, here: ReplayPoint | null, out: CanvasRenderingContext2D) {
  if (!here) return;
  const icon = trafficIcon(here.track_deg ?? null, TRAFFIC_COLOURS.far, 0, true).options;
  // The mark's SVG alone, made a document of its own (an image's SVG
  // needs its namespace, which inline markup takes from the page).
  const svg = /<svg[\s\S]*<\/svg>/.exec(icon.html)?.[0]?.replace(/^<svg(?![^>]*xmlns)/, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (!svg) return;
  const img = await pictureOf(svg);
  const scale = out.canvas.width / map.getContainer().clientWidth;
  const p = map.project([here.lon, here.lat]);
  const [w, h] = icon.iconSize;
  const [ax, ay] = icon.iconAnchor;
  out.save();
  out.translate(p.x * scale, p.y * scale);
  out.rotate((((icon.rotation ?? 0) - map.getBearing()) * Math.PI) / 180);
  out.drawImage(img, -ax * scale, -ay * scale, w * scale, h * scale);
  out.restore();
}
