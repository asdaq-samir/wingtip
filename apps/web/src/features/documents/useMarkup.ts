import { useEffect, useState } from "react";
import { showError } from "../../lib/problems";
import { cancelled, shareOrSave } from "../../lib/share";
import { toast } from "../../lib/toast";
import { INKS, notesOf, pageFileName, pageNotes, type SavedMark, type Tool } from "./markup";
import type { MarkupHandle, MarkupState } from "./readerBody";
import { useReaderPlaces } from "./readerPlaces";

const NONE: MarkupState = { canUndo: false, canRedo: false, picked: null, marks: [] };
type Inked = "highlight" | "pen";
const inked = (tool: Tool | null): tool is Inked => tool === "highlight" || tool === "pen";

/**
 * The reader's markup, its view model beside useReader: whether the
 * markup bar is out and which tool is in hand with which ink, the
 * markup's undo, a highlight's note, the document's notes list, palm
 * rejection's setting and a page shared with its marks. What it asks of
 * pdf.js goes through the PDF body's MarkupHandle (pdfMarkup).
 */
export function useMarkup(title: string) {
  const [handle, setHandle] = useState<MarkupHandle | null>(null);
  const [state, setState] = useState<MarkupState>(NONE);
  const [tool, setTool] = useState<Tool | null>(null);
  const [inks, setInks] = useState<Record<Inked, string>>({ highlight: INKS.highlight[0]!.value, pen: INKS.pen[0]!.value });
  const [sharing, setSharing] = useState(false);
  // The highlight whose note is being written: held while its popover
  // is open, as the focus in the note takes the pick off the page.
  const [noting, setNoting] = useState<SavedMark | null>(null);
  const noteMark = noting ?? state.picked;
  const pencilOnly = useReaderPlaces((s) => s.pencilOnly);
  const setPencilOnly = useReaderPlaces((s) => s.setPencilOnly);

  // The tool in hand, and its ink, given to a document's markup as it
  // comes and again as either changes.
  useEffect(() => {
    handle?.setTool(tool, inked(tool) ? inks[tool] : null);
  }, [handle, tool, inks]);

  const take = (next: Tool | null) => setTool(next);
  return {
    /** A PDF open, whose pages can be marked (not a CFR part's text). */
    available: !!handle,
    tool,
    /** The markup bar out, its first tool the highlighter. */
    toggle: () => take(tool ? null : "highlight"),
    take,
    ink: inked(tool) ? inks[tool] : null,
    inkChoices: inked(tool) ? INKS[tool] : [],
    setInk: (ink: string) => {
      if (!inked(tool)) return;
      setInks((i) => ({ ...i, [tool]: ink }));
    },
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    undo: () => handle?.undo(),
    redo: () => handle?.redo(),
    /** The highlight a note is for: the one picked, or being written. */
    noteMark,
    noting: noting !== null,
    openNote: (open: boolean) => setNoting(open ? state.picked : null),
    setNote: (note: string) => noteMark && handle?.setNote(noteMark, note),
    notes: notesOf(state.marks),
    /** Palm rejection's switch, shown once a pencil has drawn here. */
    pencilOnly,
    setPencilOnly,
    sharing,
    /** The page in view as a picture with its marks drawn in, and its
     *  notes as the words beside it. */
    sharePage: async (page: number) => {
      if (!handle) return;
      setSharing(true);
      try {
        const file = new File([await handle.pagePicture(page)], pageFileName(title, page), { type: "image/png" });
        if ((await shareOrSave({ file, title: `${title}, page ${page}`, text: pageNotes(state.marks, page) })) === "saved")
          toast.done("Page Saved");
      } catch (err) {
        if (!cancelled(err)) showError("The page could not be shared", (err as Error | undefined)?.message);
      } finally {
        setSharing(false);
      }
    },
    /** What the PDF body tells it. */
    onMarkup: setHandle,
    onMarkupState: setState,
  };
}

export type MarkupModel = ReturnType<typeof useMarkup>;
