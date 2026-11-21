import type { CfrText } from "../../lib/api/types";
import type { OutlineRow } from "./pdfPlaces";

/** What the reader shows: a PDF read a range at a time from the planner
 *  (`url`) or whole from the device (`blob`), or a CFR part's text. */
export type BodySource = { kind: "pdf"; url?: string; blob?: Blob } | { kind: "text"; text: CfrText };

/** A find asked: typed (`step` none) or its next or last match; `n` tells
 *  the same words asked again apart. */
export interface Find {
  query: string;
  step: "next" | "previous" | null;
  n: number;
}

/** A place picked from the contents or the bookmarks. */
export interface Goto {
  page?: number;
  dest?: unknown;
  n: number;
}

/** What each of the reader's bodies (PdfBody, TextBody) is given, and tells. */
export interface BodyProps {
  source: BodySource;
  /** Where it opens: a page (the last read, a bookmark, a shared link's), or a section or paragraph. */
  startPage: number | null;
  startAt: string | null;
  find: Find | null;
  goto: Goto | null;
  /** White on black, for the night. */
  inverted: boolean;
  onOutline: (rows: OutlineRow[]) => void;
  /** The page in view, of how many (a CFR part's sections are its pages). */
  onPage: (page: number, pages: number) => void;
  onMatches: (matches: { current: number; total: number }) => void;
  onFailed: () => void;
}
