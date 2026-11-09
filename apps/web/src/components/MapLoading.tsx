import { useState } from "react";
import type { MapInsets } from "../lib/mapChrome";

/**
 * Wingtip Maps' mark turning in the middle of the map while it loads (the
 * owner, 2026-11-07): the dashed airspace ring of the app's icon
 * (public/favicon.svg) goes round the airplane, which holds still. It sits
 * in the middle of what the sheet leaves, where the map opens on the
 * pilot's last position, and fades as the map fades in. With less motion
 * asked for, the mark stands still.
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
      <svg viewBox="0 0 32 32" className="size-14" aria-hidden="true">
        <g className="origin-center [transform-box:view-box] motion-safe:animate-[spin_1.6s_linear_infinite]">
          <circle
            cx="16"
            cy="16"
            r="13"
            fill="none"
            strokeWidth="2"
            strokeDasharray="7 3.2"
            transform="rotate(-112.5 16 16)"
            className="stroke-(color:--brand-mark-ring) dark:stroke-(color:--brand-mark-ring-night)"
          />
        </g>
        <g
          transform="translate(16 16.3) scale(0.36) translate(-32 -31.5)"
          strokeWidth="3.5"
          strokeLinejoin="round"
          className="fill-(--brand-mark-plane) stroke-(color:--brand-mark-plane) dark:fill-white dark:stroke-white"
        >
          <path d="M32 12 C34.2 12 35 14.5 35 18 L34.2 44 L33 51 L31 51 L29.8 44 L29 18 C29 14.5 29.8 12 32 12 Z" />
          <rect x="9" y="23" width="46" height="6.5" rx="3" />
          <rect x="23" y="45" width="18" height="4.5" rx="2.2" />
        </g>
      </svg>
    </div>
  );
}
