import { createStore, del, get, set, update } from "idb-keyval";
import type { CfrText, LibraryDocument } from "../../lib/api/types";
import { ownDocName } from "./docPlace";
import type { SavedMark } from "./markup";

/**
 * The documents kept on this device, in IndexedDB (idb-keyval's store):
 * the pilot's own PDFs -- the POH, a checklist, the insurance, the club's
 * rules -- which never leave it (docs/privacy-inventory.md), and the
 * library's documents kept for the air (Keep for the Air), each in the
 * edition it was kept in; and the pilot's markup and notes on each
 * (`marks/`), which never leave it either. Blobs, which every browser keeps in IndexedDB
 * as files, out of the page's memory; the lists beside them small.
 */
export interface FileStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  update<T>(key: string, change: (old: T | undefined) => T): Promise<void>;
}

/** A pilot's own document. */
export interface OwnDoc {
  id: string;
  name: string;
  bytes: number;
  /** When it was added, ISO 8601. */
  added: string;
}

/** A library document kept for the air, with its shelf's entry as it was
 *  kept, so the library lists it with no connection. */
export interface KeptDoc {
  doc: string;
  edition: string;
  kind: LibraryDocument["kind"];
  bytes: number;
  shelf: LibraryDocument;
}

let device: FileStore | null = null;

/** The device's own store, opened at its first use. */
export function deviceStore(): FileStore {
  if (device) return device;
  const store = createStore("wingtip-documents", "files");
  device = {
    get: (key) => get(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
    update: (key, change) => update(key, change, store),
  };
  return device;
}

const OWN = "own";
const KEPT = "kept";

export const ownDocs = async (s: FileStore): Promise<OwnDoc[]> => (await s.get<OwnDoc[]>(OWN)) ?? [];
export const ownBlob = (s: FileStore, id: string) => s.get<Blob>(`${OWN}/${id}`);

/** A PDF the pilot picked, added to their own; its name without ".pdf". */
export async function addOwn(s: FileStore, file: Blob & { name?: string }, id: string = crypto.randomUUID()): Promise<OwnDoc> {
  const doc: OwnDoc = { id, name: (file.name ?? "Document").replace(/\.pdf$/i, ""), bytes: file.size, added: new Date().toISOString() };
  await s.set(`${OWN}/${id}`, file);
  await s.update<OwnDoc[]>(OWN, (old = []) => [...old.filter((d) => d.id !== id), doc]);
  return doc;
}

/** One of the pilot's own taken away; what was taken and where it stood,
 *  for its Undo, its marks with it. */
export interface TakenDoc {
  doc: OwnDoc;
  blob: Blob;
  index: number;
  marks: SavedMark[];
}

export async function removeOwn(s: FileStore, id: string): Promise<TakenDoc | null> {
  const list = await ownDocs(s);
  const index = list.findIndex((d) => d.id === id);
  const blob = await ownBlob(s, id);
  const marks = await loadMarks(s, ownMarks(id));
  await s.update<OwnDoc[]>(OWN, (old = []) => old.filter((d) => d.id !== id));
  await s.del(`${OWN}/${id}`);
  await s.del(ownMarks(id));
  return index >= 0 && blob ? { doc: list[index]!, blob, index, marks } : null;
}

/** An Undo's way back: the document as it was, in its place in the list. */
export async function restoreOwn(s: FileStore, { doc, blob, index, marks }: TakenDoc): Promise<void> {
  await s.set(`${OWN}/${doc.id}`, blob);
  await saveMarks(s, ownMarks(doc.id), marks);
  await s.update<OwnDoc[]>(OWN, (old = []) => {
    const rest = old.filter((d) => d.id !== doc.id);
    return [...rest.slice(0, index), doc, ...rest.slice(index)];
  });
}

export async function renameOwn(s: FileStore, id: string, name: string): Promise<void> {
  const named = name.trim();
  if (!named) return;
  await s.update<OwnDoc[]>(OWN, (old = []) => old.map((d) => (d.id === id ? { ...d, name: named } : d)));
}

export const keptDocs = async (s: FileStore): Promise<KeptDoc[]> => (await s.get<KeptDoc[]>(KEPT)) ?? [];

/** A library document kept for the air, in its edition: a new edition
 *  takes the old one's place. */
export async function keepDoc(s: FileStore, doc: LibraryDocument, body: Blob | CfrText): Promise<void> {
  if (!doc.edition) return;
  const bytes = body instanceof Blob ? body.size : (doc.bytes ?? 0);
  await s.set(`${KEPT}/${doc.id}`, { edition: doc.edition, body });
  const kept: KeptDoc = { doc: doc.id, edition: doc.edition, kind: doc.kind, bytes, shelf: doc };
  await s.update<KeptDoc[]>(KEPT, (old = []) => [...old.filter((k) => k.doc !== doc.id), kept]);
}

export async function forgetDoc(s: FileStore, id: string): Promise<void> {
  await s.update<KeptDoc[]>(KEPT, (old = []) => old.filter((k) => k.doc !== id));
  await s.del(`${KEPT}/${id}`);
}

/** A kept document's body, in the edition it was kept in. */
export const keptBody = (s: FileStore, id: string) => s.get<{ edition: string; body: Blob | CfrText }>(`${KEPT}/${id}`);

/** The kept documents whose edition the shelf has replaced: kept again,
 *  so what is on the device is the edition in force. */
export function staleKept(kept: readonly KeptDoc[], shelf: readonly LibraryDocument[]): LibraryDocument[] {
  return kept.flatMap((k) => {
    const now = shelf.find((d) => d.id === k.doc);
    return now?.edition && now.edition !== k.edition ? [now] : [];
  });
}

/** Where a document's marks are kept: by the document and its edition,
 *  since a new edition's pages are not the old one's (a mark on page 42
 *  of the PHAK's C edition is not on page 42 of its D). A pilot's own
 *  has one edition. */
export const marksKey = (doc: string, edition: string) => `marks/${doc}@${edition}`;
const ownMarks = (id: string) => marksKey(ownDocName(id), "own");

export const loadMarks = async (s: FileStore, key: string): Promise<SavedMark[]> => (await s.get<SavedMark[]>(key)) ?? [];

/** A document's marks kept, or their key taken away when none is left. */
export async function saveMarks(s: FileStore, key: string, marks: readonly SavedMark[]): Promise<void> {
  if (marks.length) await s.set(key, marks);
  else await s.del(key);
}
