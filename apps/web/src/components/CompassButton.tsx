import { useEffect, useState } from "react";
import type { Map as GlMap } from "maplibre-gl";
import { Navigation2 } from "lucide-react";
import { cameraOf } from "../lib/map/gl/camera";
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

/**
 * The compass, among the map's buttons, shown only while the map is not
 * north up, as Apple Maps shows its own: its needle points where north is
 * on the screen, and a tap turns the map north up again (the camera's
 * owner, `northUp`). The app's one icon button (IconButton) on the
 * group's glass, its 44-point area index.css's; the needle in red, as
 * Apple's compass points north, apart from the location arrow's tint
 * beside it. MapLibre's NavigationControl has a compass, but always shown
 * and drawn from a picture of its own that no token reaches.
 */
export default function CompassButton({ map }: { map: GlMap | null }) {
  const bearing = useBearing(map);
  if (!map || bearing === 0) return null;
  return (
    <IconButton
      label={`Compass, the map turned ${bearing}°: turn north up`}
      data-testid="map-compass"
      data-bearing={bearing}
      className="text-foreground"
      onClick={() => cameraOf(map).northUp()}
    >
      <Navigation2 className="size-5 fill-current text-destructive" style={{ rotate: `${-bearing}deg` }} aria-hidden="true" />
    </IconButton>
  );
}
