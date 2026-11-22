import { lazy, Suspense } from "react";

// The library's page and what it keeps with (the device's store, the file
// picker), fetched as You opens it, not with You itself.
const Page = lazy(() => import("./DocumentsPage"));

/** You's Documents page (DocumentsPage), on a chunk of its own. */
export function DocumentsPage() {
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}
