import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { EventBus, PDFFindController, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { TEXT } from "../../lib/text";
import { deviceStore, loadMarks, saveMarks } from "./deviceFiles";
import { HIGHLIGHT_COLOURS, type SavedMark } from "./markup";
import { restoreMarks, startMarkup } from "./pdfMarkup";
import { headingWords, outlineRows, pinchStep, rowFor, spread, type OutlineItem } from "./pdfPlaces";
import type { BodyProps } from "./readerBody";
import { useReaderPlaces } from "./readerPlaces";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** How long a pinch's zoom is drawn as a stretched picture before the
 *  page is drawn again sharp at its new size: pdf.js's own viewer's. */
const DRAWING_DELAY_MS = 400;

/**
 * A PDF in the reader, Mozilla's pdf.js and its own viewer (pdfjs-dist's
 * PDFViewer, PDFLinkService, PDFFindController): its pages one under
 * another to scroll, the text selectable, links within it followed, the
 * find highlighted where it is, and its outline. Read a range at a time
 * from the planner (`url`) or whole from the device (`blob`, a book kept
 * for the air or the pilot's own). A pinch zooms where the fingers are,
 * as pdf.js's own viewer does it (updateScale), and so does a trackpad's.
 * Its markup is pdf.js's own annotation editors (pdfMarkup), the marks
 * kept on the device under `marksKey` and given back before the pages
 * are drawn. Its chunk is loaded with the first document opened, never
 * with the map.
 */
export default function PdfBody(props: BodyProps) {
  const { source, startPage, startAt, find, goto, inverted, marksKey } = props;
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const parts = useRef<{ bus: EventBus; viewer: PDFViewer; links: PDFLinkService } | null>(null);
  const [loading, setLoading] = useState(true);
  // Where it opens, read once: a page turned after is the pilot's.
  const start = useRef({ page: startPage, at: startAt, marksKey });
  // What it tells, the latest, so a new function from the reader does not
  // open the document again.
  const tell = useRef(props);
  useEffect(() => {
    tell.current = props;
  });

  useEffect(() => {
    if (!box.current || !inner.current || source.kind !== "pdf") return;
    const bus = new EventBus();
    const links = new PDFLinkService({ eventBus: bus });
    const finder = new PDFFindController({ eventBus: bus, linkService: links });
    const viewer = new PDFViewer({
      container: box.current,
      viewer: inner.current,
      eventBus: bus,
      linkService: links,
      findController: finder,
      annotationEditorHighlightColors: HIGHLIGHT_COLOURS,
    });
    const container = box.current;
    links.setViewer(viewer);
    parts.current = { bus, viewer, links };
    let gone = false;
    let markup: ReturnType<typeof startMarkup> | null = null;
    const key = start.current.marksKey;
    const saved: Promise<SavedMark[]> = key ? loadMarks(deviceStore(), key).catch(() => []) : Promise.resolve([]);
    const task = (async () => {
      const params = source.blob ? { data: new Uint8Array(await source.blob.arrayBuffer()) } : { url: source.url!, disableAutoFetch: true };
      return pdfjs.getDocument(params);
    })();
    bus.on("pagesinit", () => {
      viewer.currentScaleValue = "page-width";
      if (start.current.page) viewer.currentPageNumber = start.current.page;
      // The first page told too: pdf.js says nothing of the page it opens
      // at, so Bookmark and Share had no page until one was turned.
      tell.current.onPage(viewer.currentPageNumber, viewer.pagesCount);
    });
    bus.on("pagechanging", (e: { pageNumber: number }) => tell.current.onPage(e.pageNumber, viewer.pagesCount));
    const counted = (e: { matchesCount?: { current: number; total: number } }) => e.matchesCount && tell.current.onMatches(e.matchesCount);
    bus.on("updatefindmatchescount", counted);
    bus.on("updatefindcontrolstate", counted);
    void task
      .then((t) => t.promise)
      .then(async (doc) => {
        const kept = await saved;
        // Closed before it opened: the cleanup's task.destroy() frees it
        // (pdf.js 6 has no destroy on the document itself).
        if (gone) return;
        // The marks back before a page is drawn, the markup listening
        // before pdf.js makes its editor (as setDocument does).
        restoreMarks(doc, kept);
        markup = startMarkup({
          doc,
          viewer,
          bus,
          box: container,
          marks: kept,
          pencilOnly: () => useReaderPlaces.getState().pencilOnly,
          onPencil: () => useReaderPlaces.getState().setPencilOnly(true),
          onKeep: (marks) => key && void saveMarks(deviceStore(), key, marks),
          onState: (state) => tell.current.onMarkupState(state),
        });
        tell.current.onMarkup(markup);
        viewer.setDocument(doc);
        links.setDocument(doc, null);
        setLoading(false);
        const rows = outlineRows((await doc.getOutline()) as OutlineItem[] | null);
        if (gone) return;
        tell.current.onOutline(rows);
        // A cite's paragraph: its outline row, else its heading's words found.
        const at = start.current.at;
        const row = at ? rowFor(rows, at) : null;
        if (row) void links.goToDestination(row.dest as string | unknown[]);
        else if (at) bus.dispatch("find", { source: null, type: "", query: headingWords(at), highlightAll: false, findPrevious: false });
      })
      .catch(() => !gone && tell.current.onFailed());
    return () => {
      gone = true;
      parts.current = null;
      markup?.stop();
      tell.current.onMarkup(null);
      void task.then((t) => t.destroy());
      viewer.cleanup();
    };
  }, [source]);

  // A find typed, or its next or last match.
  useEffect(() => {
    if (!find || !parts.current) return;
    parts.current.bus.dispatch("find", {
      source: null,
      type: find.step ? "again" : "",
      query: find.query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: find.step === "previous",
      matchDiacritics: false,
    });
  }, [find]);

  // A row of the contents or a bookmark picked.
  useEffect(() => {
    const p = parts.current;
    if (!goto || !p) return;
    if (goto.page) p.viewer.currentPageNumber = goto.page;
    else if (goto.dest) void p.links.goToDestination(goto.dest as string | unknown[]);
  }, [goto]);

  // A pinch on a touch screen, and a trackpad's (the browser's ctrl+wheel),
  // zoom about the point between the fingers; not the page's own zoom.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let before = 0;
    const zoom = (factor: number, origin: [number, number]) => {
      const viewer = parts.current?.viewer;
      if (viewer && factor !== 1) viewer.updateScale({ scaleFactor: factor, origin, drawingDelay: DRAWING_DELAY_MS });
    };
    // The move listener that can cancel is on only while two fingers are
    // down: held all the time it made every one-finger scroll wait on the
    // main thread, where pdf.js paints (react-perf L4). One finger's pan is
    // the browser's, touch-action already keeping its own pinch off.
    const touchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      before = spread(e.touches[0]!, e.touches[1]!).distance;
      el.addEventListener("touchmove", touchMove, { passive: false });
    };
    const touchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !before) return;
      e.preventDefault();
      const { distance, origin } = spread(e.touches[0]!, e.touches[1]!);
      zoom(pinchStep(before, distance), origin);
      before = distance;
    };
    const touchEnd = (e: TouchEvent) => {
      if (e.touches.length >= 2) return;
      before = 0;
      el.removeEventListener("touchmove", touchMove);
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoom(pinchStep(1, Math.exp(-e.deltaY / 100)), [e.clientX, e.clientY]);
    };
    el.addEventListener("touchstart", touchStart, { passive: true });
    el.addEventListener("touchend", touchEnd);
    el.addEventListener("touchcancel", touchEnd);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", touchStart);
      el.removeEventListener("touchmove", touchMove);
      el.removeEventListener("touchend", touchEnd);
      el.removeEventListener("touchcancel", touchEnd);
      el.removeEventListener("wheel", wheel);
    };
  }, []);

  return (
    <>
      {/* pdf.js's viewer wants its container placed absolutely, its pages
          drawn inside its `pdfViewer`. White on black at night: the pages
          inverted, their colours turned back round. */}
      <div
        ref={box}
        className={cn("absolute inset-0 touch-pan-x touch-pan-y overflow-auto bg-muted", inverted && "invert hue-rotate-180")}
        data-testid="document-pdf"
      >
        <div ref={inner} className="pdfViewer" />
      </div>
      {loading && (
        <p role="status" className={cn("absolute inset-x-0 top-6 text-center text-muted-foreground", TEXT.prose)}>
          Opening…
        </p>
      )}
    </>
  );
}
