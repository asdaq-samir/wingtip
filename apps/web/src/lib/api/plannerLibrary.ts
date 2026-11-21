import { planner, data } from "./http";
import type { CfrText, Library } from "./types";

/**
 * The documents library's calls (features/documents; the planner's
 * wingtip.library): the shelf, a CFR part's text and a book's PDF, each
 * by the edition the shelf names, so the browser and the CDN keep it for
 * good and a new edition is a new address.
 */
export const plannerLibrary = {
  /** Every document on the shelf, each with its edition and date, or none yet. */
  library: () => planner.GET("/api/library").then(data<Library>),

  /** A CFR part's text in the edition kept: its subparts and sections. */
  libraryText: (doc: string, edition: string) =>
    planner.GET("/api/library/{doc}/{edition}/text", { params: { path: { doc, edition } } }).then(data<CfrText>),

  /** A book's PDF whole, for Keep for the Air to keep on the device. */
  libraryPdf: (doc: string, edition: string, signal?: AbortSignal) =>
    planner
      .GET("/api/library/{doc}/{edition}.pdf", { params: { path: { doc, edition } }, parseAs: "blob", signal })
      .then((r) => r.data as Blob),

  /** Where the reader reads a book a range at a time (pdf.js asks it in
   *  pieces): the planner's address under the gateway's prefix, as
   *  GatewayRequest writes every call's. */
  libraryPdfUrl: (doc: string, edition: string) => `/api/planner/library/${encodeURIComponent(doc)}/${encodeURIComponent(edition)}.pdf`,
};
