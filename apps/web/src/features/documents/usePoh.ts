import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAddressKey } from "../../lib/address";
import { addOwn, deviceStore, isPdf } from "./deviceFiles";
import { docPlaceText, ownDocName } from "./docPlace";
import { ownDocsQuery, pohLinksQuery } from "./libraryQueries";
import { changePohLinks, linkPoh, NO_POH_LINKS, pohLink, unlinkPoh, type PohLinks } from "./pohLinks";

/**
 * An airplane's POH row's view model (PohRow): the pilot's own document
 * linked to its N-number or its model (pohLinks), opened in the reader;
 * a PDF picked from the device added to Your Documents, as the library's
 * Add does, and linked; the link changed, moved between this airplane and
 * every one of its model, or taken off, the document kept.
 */
export function usePoh(tail: string, model: string | null) {
  const client = useQueryClient();
  const own = useQuery(ownDocsQuery).data ?? [];
  const links = useQuery(pohLinksQuery).data ?? NO_POH_LINKS;
  const [, setDoc] = useAddressKey("doc");
  // Before one is linked, the pilot's choice for the PDF about to be added.
  const [forAll, setForAll] = useState(false);
  const linked = pohLink(links, own, tail, model);
  const save = async (change: (old: PohLinks) => PohLinks) => {
    await changePohLinks(deviceStore(), change);
    await client.invalidateQueries({ queryKey: ["documents"] });
  };
  const forModel = linked ? linked.forModel : forAll;
  return {
    doc: linked?.doc ?? null,
    forModel,
    open: () => {
      if (linked) void setDoc(docPlaceText({ doc: ownDocName(linked.doc.id), at: null, page: null }), { history: "push" });
    },
    /** A PDF from the device, added to the pilot's own and linked (Add, or Change in place of the one linked). */
    add: async (file: File) => {
      if (!isPdf(file)) return;
      const doc = await addOwn(deviceStore(), file);
      await save((old) => linkPoh(old, tail, model, doc.id, forModel));
    },
    unlink: () => void save((old) => unlinkPoh(old, tail, model)),
    setForModel: (on: boolean) => {
      if (linked) void save((old) => linkPoh(old, tail, model, linked.doc.id, on));
      else setForAll(on);
    },
  };
}
