/**
 * The map's pictures for addImage: an SVG drawn at the screen's density,
 * and how one stretches to fit its words (icon-text-fit). A canvas's
 * tags are drawTag's.
 */

/** A picture that stretches to fit its text (icon-text-fit), its corners
 *  `inset` px each way kept as drawn; or, for a picture with more than
 *  corners to keep (a chip's diamond at its left, a callout's tail under
 *  it), the band each way that stretches and the box the text fills, px
 *  of the picture as drawn. */
export interface Stretch {
  inset: number;
  /** A one-colour shape drawn as a signed distance field, tinted by the
   *  layer's icon-color (MapLibre's sdf), so it is dimmed by its colour. */
  sdf?: boolean;
  x?: [number, number];
  y?: [number, number];
  content?: [number, number, number, number];
}

/** A picture ready for addImage: drawn, and its density and stretch. */
export interface DrawnImage {
  /** An SVG drawn (drawSvg), or a canvas's pixels (drawTag). */
  image: HTMLImageElement | ImageData;
  options: {
    pixelRatio: number;
    sdf?: boolean;
    stretchX?: [number, number][];
    stretchY?: [number, number][];
    content?: [number, number, number, number];
  };
}

/** A stretch in the picture's pixels, at its density. */
function stretchOf(
  stretch: Stretch,
  w: number,
  h: number,
  ratio: number,
): Pick<DrawnImage["options"], "stretchX" | "stretchY" | "content"> {
  const { inset } = stretch;
  const s = (v: number) => v * ratio;
  const [x0, x1] = stretch.x ?? [inset, w - inset];
  const [y0, y1] = stretch.y ?? [inset, h - inset];
  const box = stretch.content ?? [inset, inset, w - inset, h - inset];
  return { stretchX: [[s(x0), s(x1)]], stretchY: [[s(y0), s(y1)]], content: box.map(s) as [number, number, number, number] };
}

/** A picture's SVG markup drawn at the screen's density (up to three
 *  pixels a point), with its stretch for icon-text-fit; null where it
 *  cannot be drawn. */
export function drawSvg(svg: string, stretch?: Stretch): Promise<DrawnImage | null> {
  const ratio = Math.max(1, Math.min(3, Math.ceil(window.devicePixelRatio || 1)));
  return new Promise((resolve) => {
    const w = Number(/width="([\d.]+)"/.exec(svg)?.[1] ?? 24),
      h = Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? 24);
    const sized = svg
      .replace(`width="${w}"`, `width="${w * ratio}"`)
      .replace(`height="${h}"`, `height="${h * ratio}"`)
      .replace(/^<svg (?!xmlns)/, `<svg xmlns="http://www.w3.org/2000/svg" `);
    const image = new Image(w * ratio, h * ratio);
    image.onload = () => {
      // A label's box (icon-text-fit) stretches between its corners.
      const fit = stretch && stretchOf(stretch, w, h, ratio);
      resolve({ image, options: { pixelRatio: ratio, ...fit, ...(stretch?.sdf ? { sdf: true } : {}) } });
    };
    // A picture that cannot be drawn leaves its symbol bare, not the
    // layer waiting.
    image.onerror = () => resolve(null);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  });
}
