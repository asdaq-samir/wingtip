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

export interface Placed {
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
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [px, py] = middleOf(item);
      const [x, y] = view.convertToViewportPoint(px, py);
      items.push({ text: item.str, x: x!, y: y! });
    }
    return { width: view.width, height: view.height, items };
  } finally {
    void task.destroy();
  }
}
