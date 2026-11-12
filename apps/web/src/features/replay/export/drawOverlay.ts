import { CHART, SIGNAL } from "../../../lib/tokens";
import { captionAt, type Caption } from "../../../lib/replay/captions";
import { blockOf } from "../dataLines";
import { alongAt, type ReplayTrack } from "../track";

/** What a video's overlays show beside the map. */
export interface OverlayScene {
  track: ReplayTrack;
  ground: { along_nm: number; ground_ft: number }[];
  /** Burned in, or null to leave them to the SRT file. */
  captions: Caption[] | null;
  /** The sources' credit line, or null where switched off. */
  credit: string | null;
  disclaimer: boolean;
  /** The METAR in force at the moment, from the field nearest the track. */
  metar: (t: number) => string | null;
}

/** The overlays' words, which a video's viewer reads without the app. */
export const DISCLAIMER = "Reconstruction from ADS-B data. Not an official finding.";

const FONT = '"Inter Variable", system-ui, sans-serif';
/** The boxes behind the words: the map's tag ink, mostly opaque. */
const BOX_ALPHA = 0.72;

/** Lines of `text` no wider than `max` px in the context's font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const tried = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(tried).width > max) {
      lines.push(line);
      line = word;
    } else line = tried;
  }
  if (line) lines.push(line);
  return lines;
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  ctx.globalAlpha = BOX_ALPHA;
  ctx.fillStyle = CHART.tag;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}

/**
 * The overlays of a video's frame at the replay's moment `t`, drawn into
 * `ctx` (the video's size; clear for the overlays apart, over the map for
 * the finished one): the data block (the screen's own lines, blockOf) and
 * the METAR in force at the top left; the caption over the altitude
 * profile at the foot; the credit line and the reconstruction's
 * disclaimer under it. Sized to the picture's short side, so a tall video
 * reads as a wide one does.
 */
export function drawOverlay(ctx: CanvasRenderingContext2D, scene: OverlayScene, t: number) {
  const { width: W, height: H } = ctx.canvas;
  const u = Math.min(W, H) / 1080;
  const pad = 40 * u;
  ctx.textBaseline = "top";

  // The data block.
  const block = blockOf(scene.track, t);
  const lines = block.gap ? [block.gap] : block.rows.map(([name, value]) => `${name}  ${value}`);
  const blockW = 330 * u,
    blockH = (24 + 40 + lines.length * 32) * u;
  box(ctx, pad, pad, blockW, blockH, 18 * u);
  ctx.fillStyle = SIGNAL.white;
  ctx.font = `600 ${32 * u}px ${FONT}`;
  ctx.fillText(block.time, pad + 20 * u, pad + 14 * u);
  ctx.font = `500 ${25 * u}px ${FONT}`;
  lines.forEach((l, i) => ctx.fillText(l, pad + 20 * u, pad + (58 + i * 32) * u, blockW - 40 * u));

  // The METAR in force, raw as it was sent.
  const metar = scene.metar(t);
  if (metar) {
    ctx.font = `500 ${20 * u}px ${FONT}`;
    const rows = wrap(ctx, metar, Math.min(W - 2 * pad, 900 * u) - 32 * u);
    const top = pad + blockH + 14 * u;
    box(ctx, pad, top, Math.min(W - 2 * pad, 900 * u), (16 + rows.length * 26) * u, 14 * u);
    ctx.fillStyle = SIGNAL.white;
    rows.forEach((r, i) => ctx.fillText(r, pad + 16 * u, top + (10 + i * 26) * u));
  }

  // The credit and the disclaimer at the foot, the profile over them.
  const foot: string[] = [scene.credit, scene.disclaimer ? DISCLAIMER : null].filter((x): x is string => !!x);
  ctx.font = `500 ${18 * u}px ${FONT}`;
  const footRows = foot.flatMap((f) => wrap(ctx, f, W - 2 * pad));
  let bottom = H - pad;
  footRows.reverse().forEach((r) => {
    bottom -= 24 * u;
    ctx.save();
    ctx.shadowColor = CHART.tag;
    ctx.shadowBlur = 6 * u;
    ctx.fillStyle = SIGNAL.white;
    ctx.fillText(r, pad, bottom);
    ctx.restore();
  });
  const profileH = 150 * u;
  const profileTop = bottom - 12 * u - profileH;
  drawProfile(ctx, scene, t, { x: pad, y: profileTop, w: W - 2 * pad, h: profileH, u });

  // The caption on now, over the profile.
  const said = scene.captions && captionAt(scene.captions, t);
  if (said) {
    ctx.font = `600 ${34 * u}px ${FONT}`;
    const rows = wrap(ctx, said.speaker ? `${said.speaker}: ${said.text}` : said.text, W * 0.8);
    const lineH = 44 * u;
    const top = profileTop - 20 * u - rows.length * lineH;
    rows.forEach((r, i) => {
      const w = ctx.measureText(r).width + 28 * u;
      box(ctx, (W - w) / 2, top + i * lineH, w, lineH - 4 * u, 8 * u);
      ctx.fillStyle = SIGNAL.white;
      ctx.fillText(r, (W - w) / 2 + 14 * u, top + i * lineH + 4 * u);
    });
  }
}

/** The altitude profile: the ground under the track filled, the flown
 *  altitude over it (broken at each gap), and the moment marked. */
function drawProfile(
  ctx: CanvasRenderingContext2D,
  scene: OverlayScene,
  t: number,
  r: { x: number; y: number; w: number; h: number; u: number },
) {
  const { track, ground } = scene;
  box(ctx, r.x, r.y, r.w, r.h, 16 * r.u);
  const inner = { x: r.x + 16 * r.u, y: r.y + 14 * r.u, w: r.w - 32 * r.u, h: r.h - 28 * r.u };
  const alts = track.points.map((p) => p.alt_ft ?? 0);
  const top = Math.max(1000, ...alts, ...ground.map((g) => g.ground_ft)) * 1.1;
  const length = Math.max(track.lengthNm, 0.1);
  const X = (nm: number) => inner.x + (nm / length) * inner.w;
  const Y = (ft: number) => inner.y + inner.h - (Math.max(0, ft) / top) * inner.h;
  if (ground.length > 1) {
    ctx.beginPath();
    ctx.moveTo(X(ground[0]!.along_nm), Y(0));
    for (const g of ground) ctx.lineTo(X(g.along_nm), Y(g.ground_ft));
    ctx.lineTo(X(ground.at(-1)!.along_nm), Y(0));
    ctx.closePath();
    ctx.fillStyle = CHART.terrain;
    ctx.fill();
  }
  ctx.strokeStyle = CHART.trafficFar;
  ctx.lineWidth = 3 * r.u;
  ctx.beginPath();
  let drawing = false;
  for (const p of track.points) {
    if (p.alt_ft == null || p.gap) drawing = false;
    if (p.alt_ft == null) continue;
    if (drawing) ctx.lineTo(X(p.along_nm), Y(p.alt_ft));
    else ctx.moveTo(X(p.along_nm), Y(p.alt_ft));
    drawing = true;
  }
  ctx.stroke();
  const now = alongAt(track.points, t);
  if (now !== null) {
    ctx.strokeStyle = CHART.selected;
    ctx.lineWidth = 3 * r.u;
    ctx.beginPath();
    ctx.moveTo(X(now), inner.y);
    ctx.lineTo(X(now), inner.y + inner.h);
    ctx.stroke();
  }
}
