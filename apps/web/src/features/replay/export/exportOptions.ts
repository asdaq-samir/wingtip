/** A video's picture: 1080p or 4K, wide (16:9), tall (9:16, a phone's
 *  story) or square. */
export type Resolution = "1080p" | "4k";
export type Aspect = "16:9" | "9:16" | "1:1";
type Fps = 30 | 60;
/** One finished video with everything drawn in, or the layers apart for
 *  an editor: the map, the overlays with alpha, the captions. */
type ExportKind = "finished" | "layers";
/** The overlays apart: WebM VP9 with its alpha, or PNG frames, which
 *  every editor reads. */
type OverlayAs = "webm" | "png";

export interface ExportChoice {
  resolution: Resolution;
  aspect: Aspect;
  fps: Fps;
  kind: ExportKind;
  overlayAs: OverlayAs;
  credits: boolean;
  disclaimer: boolean;
  captions: boolean;
}

export const DEFAULT_CHOICE: ExportChoice = {
  resolution: "1080p",
  aspect: "16:9",
  fps: 30,
  kind: "finished",
  overlayAs: "webm",
  credits: true,
  disclaimer: true,
  captions: true,
};

/** The short side of each picture, px. */
const SHORT: Record<Resolution, number> = { "1080p": 1080, "4k": 2160 };

/** The video's size, px, even on both sides as H.264 wants. */
export function outputSize(resolution: Resolution, aspect: Aspect): { width: number; height: number } {
  const short = SHORT[resolution];
  const long = Math.round((short * 16) / 9 / 2) * 2;
  if (aspect === "16:9") return { width: long, height: short };
  if (aspect === "9:16") return { width: short, height: long };
  return { width: short, height: short };
}

/** The map is laid out at this short side, CSS px, and drawn at the
 *  video's size by its pixel ratio: a 4K video is a 1080p one's layout,
 *  sharper, rather than its labels a quarter the size. */
export const LAYOUT_SHORT_PX = 540;
