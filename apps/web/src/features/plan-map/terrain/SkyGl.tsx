import { useEffect } from "react";
import { useGlMap } from "../../../lib/map/gl/glLayer";
import { useDarkTheme } from "../../../lib/map/gl/useDarkTheme";
import { skyOf } from "./sky";

/**
 * The 3D view's sky (TerrainGl mounts it only in 3D): darker at night, in
 * the dark theme (useDarkTheme), and taken away with the 3D view, so the
 * flat chart has none.
 */
export default function SkyGl() {
  const { map } = useGlMap();
  const night = useDarkTheme();
  useEffect(() => {
    map.setSky(skyOf(night));
    map.getContainer().dataset.sky = night ? "night" : "day";
  }, [map, night]);
  useEffect(
    () => () => {
      delete map.getContainer().dataset.sky;
      if (!map.style) return;
      map.style.setSky(undefined);
      map.triggerRepaint();
    },
    [map],
  );
  return null;
}
