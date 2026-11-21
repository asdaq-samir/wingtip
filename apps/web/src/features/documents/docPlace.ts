import type { EngineAnswer } from "../../lib/engine/engine";
import type { LibraryDocument } from "../../lib/api/types";
import { SCREEN_LINK } from "../../lib/navigation/generated/screens";

/** A cite as the engine's `citations` names it: its document and place. */
export type Citation = NonNullable<EngineAnswer<"citations">["pieces"][number]["cite"]>;

/**
 * A document open in the reader, as the address's `doc` key writes it:
 * the library's document by the name the engine's citations give it
 * ("cfr-14-91", "aim", "phak") or a pilot's own PDF ("own:<id>"), and
 * after an @ where in it -- a CFR section or an AIM paragraph ("91.155",
 * "7-1-5") or a page ("p12"). So a cite tapped, a bookmark and a page
 * shared are one address, and Back closes the reader (docs/design/web.md,
 * "A URL for every card").
 */
export interface DocPlace {
  doc: string;
  /** A section or paragraph, opened at its heading. */
  at: string | null;
  /** A page, from 1. */
  page: number | null;
}

/** What a document's name and place may be written with: letters,
 *  figures and the marks a section has, nothing to read as a path. */
const NAME = /^(own:)?[a-z0-9][a-z0-9.-]{0,63}$/i;
const AT = /^[A-Za-z0-9.()-]{1,32}$/;

/** The address's `doc` read; anything else none. */
export function parseDocPlace(value: string): DocPlace | null {
  const [doc = "", where] = value.split("@", 2);
  if (!NAME.test(doc)) return null;
  if (where === undefined) return { doc, at: null, page: null };
  const page = /^p(\d{1,5})$/.exec(where);
  if (page) return { doc, at: null, page: Math.max(1, Number(page[1])) };
  return AT.test(where) ? { doc, at: where, page: null } : { doc, at: null, page: null };
}

/** A place as the address's `doc` writes it: "aim@7-1-5", "phak@p42". */
export function docPlaceText(place: DocPlace): string {
  if (place.page !== null) return `${place.doc}@p${place.page}`;
  return place.at ? `${place.doc}@${place.at}` : place.doc;
}

/** A pilot's own document, which lives on this device alone. */
export const ownDocName = (id: string) => `own:${id}`;
export const isOwn = (doc: string) => doc.startsWith("own:");

/** The link that opens a place of the library on any device: the app's
 *  address with its `doc`. A pilot's own document has none, since it is
 *  on this device alone. */
export function docLink(place: DocPlace, origin: string): string | null {
  if (isOwn(place.doc)) return null;
  return `${origin}${SCREEN_LINK.path}?doc=${encodeURIComponent(docPlaceText(place))}`;
}

/** Where a cite opens the library, where the shelf holds its document in
 *  an edition: null where it does not (a part the shelf leaves out), so
 *  the words stay words. */
export function citedPlace(cite: Citation, shelf: readonly LibraryDocument[] | undefined): DocPlace | null {
  const doc = shelf?.find((d) => d.id === cite.doc && d.edition);
  return doc ? { doc: doc.id, at: cite.at, page: null } : null;
}
