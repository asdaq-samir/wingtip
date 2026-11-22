import { AnnotationEditorParamsType, AnnotationEditorType, AnnotationMode, type PDFDocumentProxy } from "pdfjs-dist";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import {
  carryOver,
  draws,
  erases,
  sameMark,
  sweep,
  twoFingerScroll,
  withNote,
  type MarkData,
  type MarkKind,
  type SavedMark,
  type Tool,
} from "./markup";
import type { MarkupHandle, MarkupState } from "./readerBody";

/** What of pdf.js's annotation editors this reads; its own types keep
 *  them private to its viewer. */
interface Editor {
  mode: number;
  pageIndex: number;
  serialize(copying?: boolean): Record<string, unknown> | null;
}
interface UiManager {
  undo(): void;
  redo(): void;
  delete(): void;
  setSelected(editor: Editor): void;
  getEditors(pageIndex: number): Iterable<Editor>;
  readonly firstSelectedEditor: Editor | undefined;
  updateParams(type: number, value: unknown): void;
}
interface PageView {
  div: HTMLElement;
  viewport: { scale: number; convertToPdfPoint(x: number, y: number): number[] };
  annotationEditorLayer?: { annotationEditorLayer?: { endDrawingSession(aborted?: boolean): unknown } | null } | null;
}
type States = { hasSomethingToUndo?: boolean; hasSomethingToRedo?: boolean; hasSelectedEditor?: boolean };

/** Each tool's mode of pdf.js's editor; the eraser is ours, over its
 *  marks with none of its own tools on. */
const MODE: Record<Tool, number> = {
  highlight: AnnotationEditorType.HIGHLIGHT,
  pen: AnnotationEditorType.INK,
  eraser: AnnotationEditorType.NONE,
};
/** The pen's line, in PDF points: a fine felt tip. pdf.js's own is 1. */
const PEN_POINTS = 2;
/** How near the eraser's point has to come to a mark, in screen pixels: a fingertip's. */
const ERASER_PX = 12;
/** Kept on the device this long after the last change, so a stroke
 *  drawn is one write, not one a frame. */
const KEEP_AFTER_MS = 400;
/** A marked-up page's picture at twice the PDF's 72 points to the inch. */
const PICTURE_SCALE = 2;

const kindOf = (type: unknown): MarkKind | null =>
  type === AnnotationEditorType.INK ? "ink" : type === AnnotationEditorType.HIGHLIGHT ? "highlight" : null;

/** One of pdf.js's stored marks as kept here: an editor it has drawn, or
 *  a kept mark on a page it has not drawn yet (still as it was restored). */
function markOf(value: unknown): SavedMark | null {
  const editor = value && typeof (value as Editor).serialize === "function" ? (value as Editor) : null;
  const raw = editor ? editor.serialize(false) : (value as Record<string, unknown> | null);
  const kind = raw && !raw.deleted ? kindOf(raw.annotationType) : null;
  if (!raw || !kind) return null;
  const { isClone: _clone, id: _id, ...data } = raw;
  return { page: (data.pageIndex as number) + 1, kind, data: data as MarkData };
}

/** The kept marks given to pdf.js before its pages are drawn, as its own
 *  copied pages are (a "clone" in its storage): each page's editor layer
 *  draws its marks as it is drawn, editable as if just made. */
export function restoreMarks(doc: PDFDocumentProxy, marks: readonly SavedMark[]): void {
  marks.forEach((m, i) => doc.annotationStorage.setValue(`wingtip-mark-${i}`, { ...m.data, pageIndex: m.page - 1, isClone: true }));
}

/**
 * The markup over pdf.js's viewer: its highlight and ink editors as the
 * tools, its undo, our eraser and palm rejection, the notes kept beside
 * the marks, the marks kept on the device as they change, and a page's
 * picture with its marks drawn in (pdf.js's own print rendering).
 */
export function startMarkup(opts: {
  doc: PDFDocumentProxy;
  viewer: PDFViewer;
  bus: EventBus;
  box: HTMLElement;
  marks: SavedMark[];
  /** Palm rejection's setting: null until a pencil has drawn. */
  pencilOnly: () => boolean | null;
  onPencil: () => void;
  onKeep: (marks: SavedMark[]) => void;
  onState: (state: MarkupState) => void;
}): MarkupHandle & { stop: () => void } {
  const { doc, viewer, bus, box } = opts;
  let ui: UiManager | null = null;
  let tool: Tool | null = null;
  let marks = opts.marks;
  // Every mark's words and note seen this sitting, not only the marks of
  // now: pdf.js takes a kept mark out of its storage before it draws it
  // again, and a mark erased comes back with Undo, each with its note.
  let known = opts.marks;
  let states: States = {};
  let erasing: [number, number] | null = null;
  let drawingOn: PageView | null = null;
  // The words last picked on the pages, for the highlight made of them:
  // pdf.js keeps them to itself (its editor's aria-label is its own
  // name for it once localised) and empties the selection as it
  // highlights. Heard first, as this listens before pdf.js's editor is made.
  let words: string | null = null;
  const onSelection = () => {
    const picked = document.getSelection();
    const said = picked && !picked.isCollapsed && picked.anchorNode && box.contains(picked.anchorNode) ? picked.toString().trim() : "";
    if (said) words = said;
  };
  document.addEventListener("selectionchange", onSelection);
  let keepTimer: ReturnType<typeof setTimeout> | undefined;

  const storage = () => doc.annotationStorage as unknown as Iterable<[string, unknown]>;
  const picked = (): SavedMark | null => {
    const editor = states.hasSelectedEditor ? ui?.firstSelectedEditor : undefined;
    const mark = editor?.mode === AnnotationEditorType.HIGHLIGHT ? markOf(editor) : null;
    return mark ? (marks.find((m) => sameMark(m, mark)) ?? mark) : null;
  };
  const tell = () => opts.onState({ canUndo: !!states.hasSomethingToUndo, canRedo: !!states.hasSomethingToRedo, picked: picked(), marks });
  const collect = () => {
    const before = known;
    marks = carryOver(
      [...storage()].flatMap(([, v]) => markOf(v) ?? []),
      before,
    ).map((m) => {
      // A new highlight takes the words just picked.
      if (m.kind !== "highlight" || m.text || !words || before.some((b) => sameMark(b, m))) return m;
      const text = words;
      words = null;
      return { ...m, text };
    });
    known = [...marks, ...known.filter((k) => !marks.some((m) => sameMark(m, k)))];
    tell();
    opts.onKeep(marks);
  };
  const keepSoon = () => {
    clearTimeout(keepTimer);
    keepTimer = setTimeout(collect, KEEP_AFTER_MS);
  };

  const onUi = (e: { uiManager: UiManager }) => {
    ui = e.uiManager;
    if (tool) handle.setTool(tool, null);
  };
  // At once, so a highlight just made and picked has its words for its note.
  const onStates = (e: { details: States }) => {
    states = { ...e.details };
    collect();
  };
  bus.on("annotationeditoruimanager", onUi);
  bus.on("editingstateschanged", onStates);

  const pageAt = (x: number, y: number): { index: number; view: PageView } | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(".page[data-page-number]");
    const index = el ? Number(el.dataset.pageNumber) - 1 : -1;
    const view = index >= 0 ? (viewer.getPageView(index) as unknown as PageView | undefined) : undefined;
    return view ? { index, view } : null;
  };
  // The eraser: every mark of the page under it within a fingertip, each
  // taken off as pdf.js's own Delete does, so Undo puts it back.
  const eraseAt = (x: number, y: number) => {
    const at = pageAt(x, y);
    if (!ui || !at) return;
    const r = at.view.div.getBoundingClientRect();
    const [px = 0, py = 0] = at.view.viewport.convertToPdfPoint(x - r.left, y - r.top);
    const slop = ERASER_PX / at.view.viewport.scale;
    for (const editor of [...ui.getEditors(at.index)]) {
      const mark = markOf(editor);
      if (mark && erases(mark.kind, mark.data, px, py, slop)) {
        ui.setSelected(editor);
        ui.delete();
      }
    }
  };

  // Two fingers scroll the pages (markup's twoFingerScroll).
  const fingers = twoFingerScroll();
  // Palm rejection: a touch pdf.js is not to see, before it does. Its
  // own stops a second finger's touch while a pencil draws; this stops
  // a finger drawing at all once a pencil has.
  const down = (e: PointerEvent) => {
    if (!tool || tool === "highlight") return;
    // A second finger: the pages scroll, and pdf.js (whose own window
    // listener has already ended or dropped the first finger's line)
    // sees none of it.
    if (fingers.down(e.pointerId, e.pointerType, e.clientX, e.clientY)) {
      erasing = null;
      return void e.stopPropagation();
    }
    // The first pencil's stroke turns palm rejection on; a pilot who has
    // turned it off keeps it off.
    if (e.pointerType === "pen" && opts.pencilOnly() === null) opts.onPencil();
    if (!draws(e.pointerType, opts.pencilOnly() === true)) return void e.stopPropagation();
    if (tool === "pen") drawingOn = pageAt(e.clientX, e.clientY)?.view ?? null;
    if (tool === "eraser" && e.isPrimary) {
      erasing = [e.clientX, e.clientY];
      e.preventDefault();
      eraseAt(e.clientX, e.clientY);
    }
  };
  // The whole way from the last point, not each point alone: a swipe
  // moves farther between two pointer events than the eraser reaches.
  const move = (e: PointerEvent) => {
    const by = fingers.move(e.pointerId, e.clientX, e.clientY);
    if (by) {
      box.scrollBy(by[0], by[1]);
      return void e.stopPropagation();
    }
    if (fingers.scrolling && e.pointerType === "touch") return void e.stopPropagation();
    if (!erasing) return;
    for (const [x, y] of sweep(erasing, [e.clientX, e.clientY], ERASER_PX / 2)) eraseAt(x, y);
    erasing = [e.clientX, e.clientY];
  };
  const up = (e: PointerEvent) => {
    fingers.up(e.pointerId);
    erasing = null;
    // Each stroke its own mark, as a pencil's is in Notes: the eraser
    // takes one stroke and Undo one stroke, not the whole sitting. After
    // pdf.js's own pointerup has ended the line, on the page it began on.
    const on = drawingOn;
    drawingOn = null;
    if (on) setTimeout(() => on.annotationEditorLayer?.annotationEditorLayer?.endDrawingSession(false), 0);
    keepSoon();
  };
  // A finger erasing scrolls nothing.
  const touchMove = (e: TouchEvent) => !!erasing && e.cancelable && e.preventDefault();
  box.addEventListener("pointerdown", down, { capture: true });
  // Heard on the way down: in WebKit a move over the pages never bubbled
  // up to the box (on the iPad a swipe erased only where it began).
  box.addEventListener("pointermove", move, { capture: true });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  box.addEventListener("touchmove", touchMove, { passive: false });
  box.addEventListener("keyup", keepSoon);

  const handle: MarkupHandle & { stop: () => void } = {
    setTool(next: Tool | null, ink: string | null) {
      tool = next;
      box.dataset.markup = next ?? "";
      if (!ui) return;
      viewer.annotationEditorMode = { mode: next ? MODE[next] : AnnotationEditorType.NONE };
      if (ink) handle.setInk(ink);
      keepSoon();
    },
    setInk(ink: string) {
      if (tool === "pen") {
        ui?.updateParams(AnnotationEditorParamsType.INK_COLOR, ink);
        ui?.updateParams(AnnotationEditorParamsType.INK_THICKNESS, PEN_POINTS);
      } else if (tool === "highlight") ui?.updateParams(AnnotationEditorParamsType.HIGHLIGHT_COLOR, ink);
    },
    undo() {
      ui?.undo();
      keepSoon();
    },
    redo() {
      ui?.redo();
      keepSoon();
    },
    setNote(mark: SavedMark, note: string) {
      marks = withNote(marks, mark, note);
      known = withNote(known, mark, note);
      tell();
      opts.onKeep(marks);
    },
    async pagePicture(page: number): Promise<Blob> {
      const pdfPage = await doc.getPage(page);
      const viewport = pdfPage.getViewport({ scale: PICTURE_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      // pdf.js's own print rendering, which draws the marks into the page.
      await pdfPage.render({
        canvas,
        viewport,
        intent: "print",
        annotationMode: AnnotationMode.ENABLE_STORAGE,
        printAnnotationStorage: doc.annotationStorage.print,
      }).promise;
      return new Promise((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error("No picture"))), "image/png"));
    },
    stop() {
      clearTimeout(keepTimer);
      collect();
      bus.off("annotationeditoruimanager", onUi);
      bus.off("editingstateschanged", onStates);
      document.removeEventListener("selectionchange", onSelection);
      box.removeEventListener("pointerdown", down, { capture: true });
      box.removeEventListener("pointermove", move, { capture: true });
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      box.removeEventListener("touchmove", touchMove);
      box.removeEventListener("keyup", keepSoon);
    },
  };
  tell();
  return handle;
}
