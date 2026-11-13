import { useEffect } from "react";
import { useGlMap } from "../../../lib/map/gl/glLayer";
import { useExporting } from "./exportStore";

/** The map an export renders, put in the export's store from inside the
 *  map (its one line in a page's map, as ReplayCameraGl's is). */
export function ExportMapGl() {
  const { map } = useGlMap();
  useEffect(() => {
    useExporting.setState({ map });
    return () => useExporting.setState({ map: null });
  }, [map]);
  return null;
}
