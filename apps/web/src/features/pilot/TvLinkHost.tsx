import { Suspense, lazy, useState } from "react";
import { fromTvAddress } from "./tvCode";

/** The TV's sign-in sheet (TvLink) on a chunk of its own: 2.9 KB the
 *  first load carried for every pilot, drawn only for the one who opened
 *  the address a TV shows (the first-load budget, scripts/first-load.mjs). */
const TvLink = lazy(() => import("./TvLink"));

/** Where signing a TV in opens (MapPage): only on a page opened from a
 *  TV's address, read once as the page opens, as TvLink reads it. */
export default function TvLinkHost() {
  const [asked] = useState(fromTvAddress);
  return asked ? (
    <Suspense fallback={null}>
      <TvLink />
    </Suspense>
  ) : null;
}
