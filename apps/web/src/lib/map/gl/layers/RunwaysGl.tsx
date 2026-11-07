import { useQuery } from "@tanstack/react-query";
import * as maplibregl from "maplibre-gl";
import type { LayerSpecification, VectorSourceSpecification } from "maplibre-gl";
import { useEffect, useState } from "react";
import { overlayTilesQuery } from "../../../queryClient";
import { useGlLayer } from "../glLayer";
import { GL_FONT_BOLD } from "./common";

/** From MapLibre's 12, where the chart is only enlarged (BaseGl's
 *  CLOSE_FROM): before it a runway is under a pixel or two wide and the
 *  chart's own airport symbol says more. */
const RUNWAYS_FROM = 12;
const SOURCE = "faa-overlays";
const LAYER = "runways";

/** The runways' look, as ForeFlight draws them over its street map: a
 *  dark grey surface (a soft one lighter), a dashed white centreline, and
 *  each end's number in bold white on a dark halo, turned to read from
 *  the approach end (text-rotate is the end's true heading, so the
 *  number's top points down the runway, as it is painted). */
const LAYERS: LayerSpecification[] = [
  {
    id: "runway-surface", type: "fill", source: SOURCE, "source-layer": LAYER, minzoom: RUNWAYS_FROM,
    filter: ["==", ["get", "part"], "surface"],
    paint: { "fill-color": ["case", ["get", "hard"], "#4a4f57", "#7d8a6a"], "fill-outline-color": "#ffffff", "fill-opacity": 0.95 },
  },
  {
    id: "runway-centreline", type: "line", source: SOURCE, "source-layer": LAYER, minzoom: RUNWAYS_FROM + 1,
    filter: ["==", ["get", "part"], "centreline"],
    paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.75, 16, 2], "line-dasharray": [4, 3] },
  },
  {
    id: "runway-ends", type: "symbol", source: SOURCE, "source-layer": LAYER, minzoom: RUNWAYS_FROM + 0.5,
    filter: ["==", ["get", "part"], "end"],
    layout: {
      "text-field": ["get", "end_id"],
      "text-font": GL_FONT_BOLD,
      "text-size": ["interpolate", ["linear"], ["zoom"], 12.5, 10, 16, 16],
      "text-rotation-alignment": "map",
      "text-rotate": ["get", "heading"],
      // Up the number's own page, which is down the runway from its end.
      "text-offset": [0, -1.1],
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#ffffff", "text-halo-color": "#1c1a17", "text-halo-width": 1.75 },
  },
];

/**
 * The FAA's runways close in (wingtip.vector_tiles' `runways` layer, from
 * NASR APT_RWY and APT_RWY_END: each runway's surveyed ends and width),
 * read from the cycle's overlay archive by the pmtiles protocol, loaded
 * only when the map first wants it so the first page carries none of it.
 * No archive (a planner outside its image), or an archive of an older
 * build without the layer, draws nothing.
 */
export function RunwaysGl() {
  const { data: tiles } = useQuery(overlayTilesQuery);
  const [source, setSource] = useState<VectorSourceSpecification | null>(null);
  useEffect(() => {
    if (!tiles || !tiles.layers.some(l => l.name === LAYER)) return;
    let live = true;
    void import("../../overlayTiles").then(({ overlaySource, registerOverlayProtocol }) => {
      registerOverlayProtocol(maplibregl);
      if (live) setSource(overlaySource(tiles));
    });
    return () => { live = false; };
  }, [tiles]);
  return source ? <Runways key={source.url} source={source} /> : null;
}

function Runways({ source }: { source: VectorSourceSpecification }) {
  useGlLayer("lines", { [SOURCE]: source }, LAYERS);
  return null;
}
