import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { api } from "../../lib/api/client";
import type { CfrText } from "../../lib/api/types";
import { useDarkTheme } from "../../lib/map/gl/useDarkTheme";
import { shareOrCopy } from "../../lib/share";
import { toast } from "../../lib/toast";
import { deviceStore, keptBody, ownBlob } from "./deviceFiles";
import { docLink, isOwn, type DocPlace } from "./docPlace";
import { keptDocsQuery, libraryQuery, ownDocsQuery } from "./libraryQueries";
import type { BodySource } from "./readerBody";
import { useReaderPlaces } from "./readerPlaces";

/** Why a document cannot be shown, in the reader's own words. */
export type ReaderTrouble = "gone" | "unreachable" | null;

/**
 * The reader's view model (Reader): which document, where its pages come
 * from, where it opens, its bookmarks, the night's inversion and Share.
 *
 * Its pages come from the device where they are there -- the pilot's own,
 * or a library document kept for the air in the edition the shelf names
 * (or in any edition with no shelf to ask, offline) -- else from the
 * planner, a PDF a range at a time, a CFR part's text whole.
 */
export function useReader(place: DocPlace) {
  const own = isOwn(place.doc);
  const id = own ? place.doc.slice("own:".length) : place.doc;
  const shelf = useQuery({ ...libraryQuery, enabled: !own });
  // The shelf's entry, else as it was kept (no signal): its title and edition.
  const keptEntry = useQuery({ ...keptDocsQuery, enabled: !own }).data?.find((k) => k.doc === id)?.shelf;
  const entry = shelf.data?.documents.find((d) => d.id === id) ?? keptEntry;
  const owned = useQuery({ ...ownDocsQuery, enabled: own }).data?.find((d) => d.id === id);
  const onDevice = useQuery({
    queryKey: ["documents", "body", place.doc],
    queryFn: async () => (own ? { edition: "own", body: (await ownBlob(deviceStore(), id)) ?? null } : ((await keptBody(deviceStore(), id)) ?? null)),
    staleTime: Infinity,
  });
  const kept = onDevice.data && onDevice.data.body && (own || !entry?.edition || onDevice.data.edition === entry.edition) ? onDevice.data.body : null;
  const network = !own && !kept && onDevice.isFetched && entry?.edition ? entry : null;
  const text = useQuery({
    queryKey: ["documents", "text", id, network?.edition],
    queryFn: () => api.libraryText(id, network!.edition!),
    enabled: network?.kind === "text",
    staleTime: Infinity,
    meta: { silent: true },
  });

  const source = useMemo<BodySource | null>(() => {
    if (kept instanceof Blob) return { kind: "pdf", blob: kept };
    if (kept) return { kind: "text", text: kept as CfrText };
    if (network?.kind === "pdf") return { kind: "pdf", url: api.libraryPdfUrl(id, network.edition!) };
    if (text.data) return { kind: "text", text: text.data };
    return null;
  }, [kept, network, id, text.data]);

  const trouble: ReaderTrouble = source
    ? null
    : own
      ? onDevice.isFetched
        ? "gone"
        : null
      : onDevice.isFetched && (shelf.isError || text.isError || (shelf.isSuccess && !entry?.edition))
        ? "unreachable"
        : null;

  const left = useReaderPlaces((s) => s.pages[place.doc] ?? null);
  const bookmarks = useReaderPlaces((s) => s.bookmarks[place.doc]) ?? [];
  const chosen = useReaderPlaces((s) => s.inverted);
  const dark = useDarkTheme();
  const places = useReaderPlaces.getState();
  const title = own ? (owned?.name ?? "Document") : (entry?.title ?? id);
  // Told at every page turned: the same function for the document, so a
  // body's watch on the pages is not made again at each render.
  const leftAt = useCallback((page: number) => useReaderPlaces.getState().leftAt(place.doc, page), [place.doc]);

  return {
    title,
    /** The edition as a pilot reads it, and its date: the contents' head. */
    edition: entry?.label ? [entry.label, entry.date].filter(Boolean).join(" · ") : null,
    source,
    trouble,
    /** Where it opens: a shared or bookmarked page, a cite's paragraph, else where it was left. */
    startPage: place.page ?? (place.at ? null : left),
    startAt: place.at,
    bookmarks,
    /** White on black: the pilot's own choice, else the app's dark appearance. */
    inverted: chosen ?? dark,
    setInverted: places.setInverted,
    leftAt,
    toggleBookmark: (page: number, label: string) => places.toggleBookmark(place.doc, page, label),
    /** The page in view as a link, on the platform's share sheet or copied;
     *  none for a pilot's own document, which is on this device alone. */
    share: own
      ? null
      : async (page: number | null) => {
          const url = docLink({ doc: place.doc, at: page ? null : place.at, page }, window.location.origin);
          if (!url) return;
          try {
            if ((await shareOrCopy({ title, url })) === "copied") toast.done("Link Copied");
          } catch {
            // The share sheet closed with nothing sent: nothing to say.
          }
        },
  };
}
