import { Suspense, lazy, useState } from "react";

/** The emailed link's sign-in sheet (LinkSignIn) on a chunk of its own,
 *  drawn only on a page a sign-in link opened: the first load's budget
 *  (scripts/first-load.mjs, the speed audit 2026-11-12). */
const LinkSignIn = lazy(() => import("./LinkSignIn"));

/** The token an emailed sign-in link brought, from the address's
 *  fragment (`#signin=…`), where the link's redirect put it
 *  (MagicLinkController#confirm). */
function linkToken(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get("signin");
}

/** Where an emailed sign-in link is finished (MapPage): read once as the
 *  page opens, as the sheet always read it. */
export default function LinkSignInHost() {
  const [token] = useState(linkToken);
  return token === null ? null : (
    <Suspense fallback={null}>
      <LinkSignIn token={token} />
    </Suspense>
  );
}
