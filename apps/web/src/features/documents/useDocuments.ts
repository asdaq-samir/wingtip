import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../../lib/api/client";
import type { LibraryDocument } from "../../lib/api/types";
import { useAddressKey } from "../../lib/address";
import { toast } from "../../lib/toast";
import { addOwn, deviceStore, forgetDoc, keepDoc, removeOwn, renameOwn, restoreOwn, staleKept } from "./deviceFiles";
import { docPlaceText, ownDocName, type DocPlace } from "./docPlace";
import { keptDocsQuery, libraryQuery, ownDocsQuery } from "./libraryQueries";
import { forgetPlaces } from "./readerPlaces";

/** The shelf's groups in the order the page lists them. */
const GROUPS = ["Regulations", "AIM", "Handbooks", "Advisory Circulars", "Charts"] as const;

/**
 * The documents library's view model (DocumentsPage): the pilot's own
 * documents and the FAA's shelf, each document's edition and whether it is
 * kept on this device, and the verbs -- Open, Keep for the Air and its
 * undoing, Add, Rename and Delete with its Undo.
 *
 * A kept document whose edition the shelf has replaced is kept again as
 * the shelf is read (the FAA publishes a new one, the planner fetches it,
 * this device takes it), so what is on board is the edition in force.
 */
export function useDocuments() {
  const client = useQueryClient();
  const shelf = useQuery(libraryQuery);
  const own = useQuery(ownDocsQuery).data ?? [];
  const kept = useQuery(keptDocsQuery).data;
  const [, setDoc] = useAddressKey("doc");
  // The documents being fetched to keep, and those that could not be:
  // said on their rows, where they happen.
  const [keeping, setKeeping] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const refresh = () => client.invalidateQueries({ queryKey: ["documents"] });
  const mark = (id: string, on: boolean, set: typeof setKeeping) =>
    set((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const keep = async (doc: LibraryDocument) => {
    if (!doc.edition) return;
    mark(doc.id, true, setKeeping);
    mark(doc.id, false, setFailed);
    try {
      const body = doc.kind === "pdf" ? await api.libraryPdf(doc.id, doc.edition) : await api.libraryText(doc.id, doc.edition);
      await keepDoc(deviceStore(), doc, body);
      await refresh();
    } catch {
      mark(doc.id, true, setFailed);
    } finally {
      mark(doc.id, false, setKeeping);
    }
  };

  // Updates itself: an edition replaced on the shelf, kept again.
  const stale = shelf.data && kept ? staleKept(kept, shelf.data.documents) : [];
  const staleKey = stale.map((d) => `${d.id}@${d.edition}`).join(",");
  useEffect(() => {
    for (const doc of stale) void keep(doc);
    // Once for each new edition the shelf names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staleKey]);

  // With no shelf to read (no signal), what is kept on the device, as it was kept.
  const shelfDocs = shelf.data?.documents ?? kept?.map((k) => k.shelf) ?? [];
  return {
    own,
    groups: GROUPS.map((group) => ({ group, documents: shelfDocs.filter((d) => d.group === group) })).filter((g) => g.documents.length),
    shelfLoading: shelf.isPending,
    shelfFailed: shelf.isError,
    isKept: (id: string) => !!kept?.some((k) => k.doc === id),
    isKeeping: (id: string) => keeping.has(id),
    keepFailed: (id: string) => failed.has(id),
    open: (place: DocPlace) => void setDoc(docPlaceText(place), { history: "push" }),
    keep,
    forget: async (doc: LibraryDocument) => {
      await forgetDoc(deviceStore(), doc.id);
      await refresh();
    },
    /** PDFs picked from the device's files, each added to the pilot's own. */
    add: async (files: Iterable<File>) => {
      for (const file of files) if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) await addOwn(deviceStore(), file);
      await refresh();
    },
    rename: async (id: string, name: string) => {
      await renameOwn(deviceStore(), id, name);
      await refresh();
    },
    /** One of the pilot's own taken off this device, with an Undo that puts it back. */
    remove: async (id: string) => {
      const taken = await removeOwn(deviceStore(), id);
      await refresh();
      if (!taken) return;
      // Its last page and bookmarks go once the Undo has gone unused.
      let restored = false;
      toast.undo(
        `${taken.doc.name} Deleted`,
        () => {
          restored = true;
          void restoreOwn(deviceStore(), taken).then(refresh);
        },
        { onClose: () => !restored && forgetPlaces(ownDocName(id)), testId: "document-undo" },
      );
    },
  };
}
