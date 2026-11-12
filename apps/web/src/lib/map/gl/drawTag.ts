import { CHART } from "../../tokens";
import type { DrawnImage } from "./glLayer";

/** A run of words on a tag's line, in its own ink and weight. */
interface TagRun {
  text: string;
  colour: string;
  /** 700 bold (the default), 600 the lighter parts (a fix's IAF). */
  weight?: number;
  opacity?: number;
}

/** A line of a tag: its runs, and the bars a chart sets over or under an
 *  altitude (a minimum underlined, a maximum overlined, a mandatory one
 *  both: the FAA's Terminal Procedures Publication legend). */
export interface TagLine {
  runs: TagRun[];
  under?: boolean;
  over?: boolean;
}

export interface Tag {
  lines: TagLine[];
  background: string;
  /** Points: the type's size and its line's height. */
  size: number;
  lineHeight: number;
  padX: number;
  padY: number;
  radius: number;
  /** The lines centred (a plate's tag), else from the left. */
  centred?: boolean;
}

/** The page's own face, which the map's words are set in too. */
const FACE = `"Inter Variable", Inter, sans-serif`;

/**
 * A tag of several lines drawn as a picture for the map (useGlSymbols):
 * the procedures' fixes and a plate's annotations, whose altitudes carry
 * the chart's bars, which MapLibre's text cannot draw. On a 2D canvas in
 * the page's Inter, at the screen's density (up to three pixels a
 * point), its shadow the marks' (--depth-mark, in the chart's shade); null where there is no
 * canvas.
 */
export async function drawTag(tag: Tag): Promise<DrawnImage | null> {
  await document.fonts?.load(`700 ${tag.size}px ${FACE}`).catch(() => undefined);
  const ratio = Math.max(1, Math.min(3, Math.ceil(window.devicePixelRatio || 1)));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const font = (run: TagRun) => `${run.weight ?? 700} ${tag.size}px ${FACE}`;
  const widthOf = (line: TagLine) =>
    line.runs.reduce((w, run) => {
      ctx.font = font(run);
      return w + ctx.measureText(run.text).width;
    }, 0);
  const widths = tag.lines.map(widthOf);
  const shadow = 4;
  const w = Math.ceil(Math.max(0, ...widths) + 2 * tag.padX),
    h = Math.ceil(tag.lines.length * tag.lineHeight + 2 * tag.padY);
  canvas.width = (w + 2 * shadow) * ratio;
  canvas.height = (h + 2 * shadow) * ratio;
  ctx.scale(ratio, ratio);
  ctx.translate(shadow, shadow);
  ctx.save();
  ctx.shadowColor = `${CHART.shade}59`;
  ctx.shadowBlur = 3 * ratio;
  ctx.shadowOffsetY = ratio;
  ctx.fillStyle = tag.background;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, tag.radius);
  ctx.fill();
  ctx.restore();
  ctx.textBaseline = "middle";
  tag.lines.forEach((line, i) => {
    const middle = tag.padY + (i + 0.5) * tag.lineHeight;
    let x = tag.centred ? (w - widths[i]!) / 2 : tag.padX;
    const start = x;
    for (const run of line.runs) {
      ctx.font = font(run);
      ctx.fillStyle = run.colour;
      ctx.globalAlpha = run.opacity ?? 1;
      ctx.fillText(run.text, x, middle);
      x += ctx.measureText(run.text).width;
    }
    ctx.globalAlpha = 1;
    // The bars in the line's first ink, 1.5 points, just clear of the
    // letters' caps and baseline.
    ctx.fillStyle = line.runs[0]?.colour ?? CHART.fixInk;
    const half = tag.size * 0.42;
    if (line.over) ctx.fillRect(start, middle - half - 1.5, x - start, 1.5);
    if (line.under) ctx.fillRect(start, middle + half, x - start, 1.5);
  });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { image: data, options: { pixelRatio: ratio } };
}
