import { Suspense, lazy, type ReactNode } from "react";

// The section, its toolbar and its menus on a chunk of their own: the
// feature's query (useNotamRanking) is read by what keeps a route for the
// air, in the first load, and the section sharing a chunk with it put its
// menus there too (scripts/first-load.mjs, 2026-11-10). The Brief draws it.
const Section = lazy(() => import("./NotamRankingSection"));
const Row = lazy(() => import("./NotamsRow"));

/** The NOTAMs that matter (NotamRankingSection), on Preflight, loaded when drawn. */
export default function NotamRankingLazy() {
  return (
    <Suspense fallback={null}>
      <Section />
    </Suspense>
  );
}

/** The Brief's NOTAMs row (NotamsRow), loaded when drawn; till then
 *  `fallback`, the same row without its count, so nothing moves. */
export function NotamsRow({ onOpen, fallback }: { onOpen: () => void; fallback: ReactNode }) {
  return (
    <Suspense fallback={fallback}>
      <Row onOpen={onOpen} />
    </Suspense>
  );
}
