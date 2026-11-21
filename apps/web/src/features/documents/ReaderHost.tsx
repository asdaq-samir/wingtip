import { lazy, Suspense } from "react";
import { useAddressKey } from "../../lib/address";
import { parseDocPlace } from "./docPlace";

// The reader and what it reads with, off the first load: fetched with the
// first document opened.
const Reader = lazy(() => import("./Reader"));

/**
 * The reader over the app, wherever a document is asked for: the
 * address's `doc` (a cite tapped, a row of the library, a shared link,
 * Back), so it opens over the map, the Brief or a card alike, and closes
 * back to where the pilot was.
 */
export function DocumentReaderHost() {
  const [doc, setDoc] = useAddressKey("doc");
  const place = doc ? parseDocPlace(doc) : null;
  if (!doc || !place) return null;
  return (
    <Suspense fallback={null}>
      <Reader key={doc} place={place} onClose={() => void setDoc(null)} />
    </Suspense>
  );
}
