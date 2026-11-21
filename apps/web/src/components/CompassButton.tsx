import { useEffect, useState } from "react";
import type { Map as GlMap } from "maplibre-gl";
import { cn } from "cn";
import { cameraOf } from "../lib/map/gl/camera";
import { compassPoint } from "../lib/compass";
import { GLASS } from "../lib/mapChrome";
import { TEXT } from "../lib/text";
import IconButton from "./IconButton";

/** The map's bearing to the nearest degree, 0 to 359, as MapLibre turns it. */
function useBearing(map: GlMap | null): number {
  const [bearing, setBearing] = useState(0);
  useEffect(() => {
    if (!map) return;
    const say = () => setBearing((Math.round(map.getBearing()) + 360) % 360);
    say();
    map.on("rotate", say);
    return () => void map.off("rotate", say);
  }, [map]);
  return bearing;
}

/** The dial's ticks, every 30°, the four cardinal ones longer. */
const TICKS = Array.from({ length: 12 }, (_, i) => i * 30);

/**
 * The compass, shown only while the map is not north up, drawn as Apple
 * Maps' own (the owner, 2026-11-18, sending Maps' screenshot: "Can the
 * compass be shown like on Apple Maps instead of our red arrow"): a round
 * glass disc the 3D button's size (ThreeDButton), its dial's ticks and a
 * small red mark at north turning with the chart, and in the middle the
 * point of the compass the top of the screen faces ("W"), the engine's
 * (lib/compass), where it was a red arrow alone. A tap turns the map
 * north up again (the camera's owner, `northUp`). MapLibre's
 * NavigationControl has a compass, but always shown and drawn from a
 * picture of its own that no token reaches.
 */
export default function CompassButton({ map }: { map: GlMap | null }) {
  const bearing = useBearing(map);
  if (!map || bearing === 0) return null;
  const point = compassPoint(bearing);
  return (
    <div data-map-food="" className={cn("flex rounded-full p-1", GLASS)}>
      <IconButton
        label={`Compass, the map turned ${bearing}°: turn north up`}
        data-testid="map-compass"
        data-bearing={bearing}
        // 44 px whatever the text size, as the map's other buttons (MAP_BUTTON).
        className="relative size-(--size-map-button) rounded-full text-foreground"
        onClick={() => cameraOf(map).northUp()}
      >
        <svg viewBox="-18 -18 36 36" className="absolute inset-0 size-full" style={{ rotate: `${-bearing}deg` }} aria-hidden="true">
          {TICKS.map((deg) => (
            <line
              key={deg}
              x1="0"
              y1={deg % 90 === 0 ? -16.5 : -16}
              x2="0"
              y2={deg % 90 === 0 ? -13 : -14.5}
              transform={`rotate(${deg})`}
              className="stroke-current opacity-50"
              strokeWidth={deg % 90 === 0 ? 1.5 : 1}
              strokeLinecap="round"
            />
          ))}
          {/* North: a small red triangle on the dial's edge, pointing out. */}
          <path d="M0 -17.5 L2.5 -12.5 L-2.5 -12.5 Z" className="fill-destructive" />
        </svg>
        <span aria-hidden="true" className={cn("relative font-semibold", point.length > 2 ? TEXT.caption : TEXT.detail)}>
          {point}
        </span>
      </IconButton>
    </div>
  );
}
