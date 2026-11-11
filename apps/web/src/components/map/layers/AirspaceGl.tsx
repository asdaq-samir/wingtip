import { AirspaceCardBody } from "../cards/AirspaceCard";
import { useGlMap, useGlTap } from "../../../lib/map/gl/glLayer";
import { volumeOfTile } from "../../../lib/map/gl/glOverlays";
import { AIRSPACE_LINE_LAYERS, airspaceText } from "../../../lib/map/gl/glStyle";
import { useGlProbe } from "../../../lib/map/gl/useGlProbe";
import { TAP } from "../../../lib/map/gl/layers/common";

/**
 * The Class B, C and D over the chart, each volume's line with a
 * translucent band along its inside and its altitudes in a dark tab on
 * its ring, one a shelf -- MapLibre's line layers and a symbol layer,
 * kept off each other by its collision; and the special-use areas'
 * lines and hatched bands (glStyle's specialUseLayers). A tap on a
 * line opens the volume's card. The settings' Airspace turns them off
 * (applyOverlayFilters).
 *
 * The lines and labels are the cycle's overlay tiles' (glOverlays, drawn
 * per tile in the map's style); this adds the probes and the taps, a
 * tap's card built from the tapped ring's own fields (volumeOfTile).
 * Nothing until the map has the tiles.
 */
export function AirspaceGl() {
  const { overlays } = useGlMap();
  return overlays ? <TileAirspace /> : null;
}

function TileAirspace() {
  const { openCard } = useGlMap();
  useGlProbe("airspace-lines", AIRSPACE_LINE_LAYERS, (f) => ({ id: `tile-${f.properties.number}`, cls: f.properties.class }));
  useGlProbe("airspace-edge-labels", ["airspace-labels"], (f) => ({
    id: `tile-${f.properties.number}`,
    text: airspaceText(volumeOfTile(f, { lat: 0, lon: 0 })),
    angle: Number(f.properties.angle ?? 0),
  }));
  useGlTap(AIRSPACE_LINE_LAYERS, TAP.line, TAP.rank.line, (feature, event) => {
    const volume = volumeOfTile(feature, { lat: event.lngLat.lat, lon: event.lngLat.lng });
    openCard(<AirspaceCardBody key={volume.id} volume={volume} close={() => openCard(null)} />);
  });
  return null;
}
