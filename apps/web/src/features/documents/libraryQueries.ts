import { queryOptions } from "@tanstack/react-query";
import { deviceStore, keptDocs, ownDocs } from "./deviceFiles";

export { libraryQuery } from "./shelfQuery";

/** What this device holds: the pilot's own documents and those kept for the air. */
export const ownDocsQuery = queryOptions({ queryKey: ["documents", "own"], queryFn: () => ownDocs(deviceStore()), staleTime: Infinity });
export const keptDocsQuery = queryOptions({ queryKey: ["documents", "kept"], queryFn: () => keptDocs(deviceStore()), staleTime: Infinity });
