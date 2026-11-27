import { queryOptions } from "@tanstack/react-query";
import { deviceStore, keptDocs, ownDocs } from "./deviceFiles";
import { pohLinks } from "./pohLinks";

export { libraryQuery } from "./shelfQuery";

/** What this device holds: the pilot's own documents and those kept for the air. */
export const ownDocsQuery = queryOptions({ queryKey: ["documents", "own"], queryFn: () => ownDocs(deviceStore()), staleTime: Infinity });
export const keptDocsQuery = queryOptions({ queryKey: ["documents", "kept"], queryFn: () => keptDocs(deviceStore()), staleTime: Infinity });
/** Which of the pilot's own documents is each airplane's POH (pohLinks). */
export const pohLinksQuery = queryOptions({ queryKey: ["documents", "poh"], queryFn: () => pohLinks(deviceStore()), staleTime: Infinity });
