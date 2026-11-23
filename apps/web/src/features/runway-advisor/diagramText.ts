/**
 * An airport diagram's words and where each is drawn, read from the
 * d-TPP's PDF with Mozilla's pdf.js, as the phones read theirs with
 * PDFKit and PdfRenderer: what the engine places the page by (its
 * latitude and longitude labels, diagram_graticule) and finds the hot
 * spots in (diagram_hot_spots). Each run of text at the middle of its box
 * in the page as it is shown -- its /Rotate turned, the top left the
 * origin, a point a unit -- the frame the planner's picture of the page
 * is drawn in, so a place found here is a place on the picture.
 */

interface Placed {
  text: string;
  x: number;
  y: number;
}

export interface DiagramText {
  /** The page as shown, points. */
  width: number;
  height: number;
  items: Placed[];
}

/** A text run as pdf.js gives it: its words, its matrix (its baseline's
 *  start at e, f and its direction a, b in the PDF's own space, y up),
 *  and its box's length along it and height across it. */
interface Run {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/** A run's middle in the PDF's own space: from its start, half its length
 *  along its direction and half its height across it (turned a quarter
 *  anticlockwise from it: up the letters). */
export function middleOf(run: Run): [number, number] {
  const [a = 1, b = 0, , , e = 0, f = 0] = run.transform;
  const n = Math.hypot(a, b) || 1;
  const [dx, dy] = [a / n, b / n];
  return [e + (dx * run.width) / 2 - (dy * run.height) / 2, f + (dy * run.width) / 2 + (dx * run.height) / 2];
}

/** Where a run starts and ends along its baseline, and its direction. */
function endsOf(run: Run) {
  const [a = 1, b = 0, , , e = 0, f = 0] = run.transform;
  const n = Math.hypot(a, b) || 1;
  const [dx, dy] = [a / n, b / n];
  return { dx, dy, start: [e, f] as const, end: [e + dx * run.width, f + dy * run.width] as const };
}

/**
 * The runs pdf.js gives joined into the words as drawn: a d-TPP diagram's
 * turned labels come a glyph group at a time ("92", "°", "11", "'", "W"
 * for KDLH's 92°11'W, pdfjs-dist 6), and the engine reads a whole label
 * ("92°11'W") or none, so own ship was never placed on such a page
 * (runway-advisor.spec). A run is the one before it carried on where it
 * starts within its own height of that one's end, in the same direction.
 */
export function joinRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    const last = out.at(-1);
    if (last) {
      const [was, now] = [endsOf(last), endsOf(run)];
      const near = Math.hypot(now.start[0] - was.end[0], now.start[1] - was.end[1]) <= Math.max(last.height, run.height);
      const along = Math.abs(was.dx - now.dx) < 0.05 && Math.abs(was.dy - now.dy) < 0.05;
      if (near && along) {
        const width = (now.end[0] - was.start[0]) * was.dx + (now.end[1] - was.start[1]) * was.dy;
        out[out.length - 1] = { ...last, str: last.str + run.str, width, height: Math.max(last.height, run.height) };
        continue;
      }
    }
    out.push(run);
  }
  return out;
}

/** The first page's words read from the PDF at `url`. */
export async function readDiagram(url: string): Promise<DiagramText> {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ url });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const view = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: Placed[] = [];
    // Joined with the spaces between them, so words a space apart stay apart.
    const runs = content.items.filter((item): item is Run & (typeof content.items)[number] => "str" in item);
    for (const item of joinRuns(runs)) {
      if (!item.str.trim()) continue;
      const [px, py] = middleOf(item);
      const [x, y] = view.convertToViewportPoint(px, py);
      items.push({ text: item.str, x: x!, y: y! });
    }
    return { width: view.width, height: view.height, items };
  } finally {
    void task.destroy();
  }
}
