import { useState } from "react";
import { Spinner } from "./ui/spinner";
import type { MapInsets } from "../lib/mapChrome";

/**
 * The stock spinner in the middle of the map while it loads, in the
 * middle of what the sheet leaves, where the map opens on the pilot's last
 * position, fading as the map fades in. Wingtip's mark turned here (the
 * owner, 2026-11-07); it stays on the launch screen alone (index.html),
 * the stock spinner for every wait after it (the owner, 2026-11-10).
 */
export default function MapLoading({ shown, insets }: { shown: boolean; insets: Pick<MapInsets, "top" | "bottom" | "left"> }) {
  // Gone from the tree once it has faded, so nothing turns under the map.
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <div
      role="status"
      aria-label="Loading the map"
      data-testid="map-loading"
      className={`pointer-events-none absolute flex items-center justify-center transition-opacity duration-150 ease-out ${shown ? "opacity-100" : "opacity-0"}`}
      style={{ top: insets.top, bottom: insets.bottom, left: insets.left, right: 0 }}
      onTransitionEnd={() => {
        if (!shown) setGone(true);
      }}
    >
      <Spinner className="size-8 text-muted-foreground" role={undefined} aria-label={undefined} aria-hidden />
    </div>
  );
}
