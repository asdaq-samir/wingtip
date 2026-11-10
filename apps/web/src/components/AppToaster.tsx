import { Suspense, useEffect, type CSSProperties } from "react";
import { useNavEdge } from "../hooks/use-nav-edge";
import { fromChunk } from "../lib/fromChunk";
import { loadToasts, useToastsWanted } from "../lib/toast";

// Base UI's Toast on a chunk of its own, with the Toaster round it:
// mounted once a toast is asked for or the page is idle, not in the first
// load (lib/toast, issue #290).
const { Part: Toaster } = fromChunk(
  () => import("./ui/toast"),
  (m) => m.Toaster,
);

/**
 * The app's one Toaster -- PageStatus's progress line (across every page
 * that has one) renders through it via toast.add/close, rather
 * than each page mounting its own floating status element.
 *
 * On the edge away from the header (useNavEdge): bottom-centre under a
 * header at the top, and top-centre over one at the bottom. From the top
 * it comes in as an iOS banner does, over the map and clear of a sheet
 * from the bottom; on a phone, across the map's buttons from either edge,
 * the location arrow under it still taking a tap (a toast takes none,
 * index.css).
 *
 * Only news that goes by itself -- progress, "Charts Saved Offline" -- so
 * no close button, as iOS's banners have none: what went wrong is said
 * where it belongs (lib/problems), not in a toast. Apple Maps' banner, at
 * the owner's ask (the toast rewrite, 2026-10-27): a frosted capsule with
 * a tick in the tint, two seconds of it, the words a short title.
 */
export default function AppToaster() {
  const edge = useNavEdge();
  const wanted = useToastsWanted();
  // Fetched once the page is idle, so the first toast does not wait on it.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((go: () => void) => window.setTimeout(go, 2000));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => void loadToasts());
    return () => cancel(handle);
  }, []);
  if (!wanted) return null;
  return (
    <Suspense fallback={null}>
      <Toaster
        position={edge === "bottom" ? "top" : "bottom"}
        style={
          {
            // With the sheet at the top the toast comes up from the foot,
            // where the map's buttons stand on both sides: between them,
            // not over them (a check of the Top layout on the phone,
            // 2026-10-27). 44 points of button, its margin and a little air.
            "--width": edge === "top" ? "min(34rem, calc(100vw - 8.5rem))" : "min(34rem, calc(100vw - 2rem))",
            // Under the notch or the Dynamic Island, or over the home
            // indicator, where there is one.
            "--offset-top": "max(0.5rem, env(safe-area-inset-top))",
            "--offset-bottom": "max(1rem, env(safe-area-inset-bottom))",
          } as CSSProperties
        }
        // A toast still on screen was printing over the briefing's table;
        // the paper is the briefing alone.
        className="print:hidden"
      />
    </Suspense>
  );
}
