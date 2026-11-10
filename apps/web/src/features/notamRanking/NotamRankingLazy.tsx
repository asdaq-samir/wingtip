import { Suspense, lazy } from "react";

// The section, its toolbar and its menus on a chunk of their own: the
// feature's query (useNotamRanking) is read by what keeps a route for the
// air, in the first load, and the section sharing a chunk with it put its
// menus there too (scripts/first-load.mjs, 2026-11-10). The Brief draws it.
const Section = lazy(() => import("./NotamRankingSection"));

/** The Brief's NOTAMs that matter (NotamRankingSection), loaded when drawn. */
export default function NotamRankingLazy() {
  return (
    <Suspense fallback={null}>
      <Section />
    </Suspense>
  );
}
