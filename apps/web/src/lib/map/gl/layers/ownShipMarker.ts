import { Marker, type Map as MlMap } from "maplibre-gl";

/** Own ship's marker, the one HTML marker on any map (semgrep's
 *  html-marker-on-the-map): the map's (OwnShipGl), and the full-screen chart
 *  viewer's on a plate's page (AirportDiagramViewer). Untouchable, turned
 *  with the map. */
export function ownShipMarker(testId?: string): Marker {
  const el = document.createElement("div");
  el.style.pointerEvents = "none";
  if (testId) el.dataset.testid = testId;
  return new Marker({ element: el, rotationAlignment: "map" });
}

/** Writes the mark (icons.ts ownShipHtml) into the marker's element only
 *  when it changed: the same at nearly every fix (only its place and turn
 *  change), so the element is not built again each second. `drawn` holds
 *  the HTML last written. */
export function drawOwnShip(marker: Marker, drawn: { current: string }, { size, html }: { size: number; html: string }) {
  const el = marker.getElement();
  if (drawn.current === html && el.childElementCount > 0) return;
  drawn.current = html;
  el.style.width = el.style.height = `${size}px`;
  el.innerHTML = html;
}

/** The mark moved to its fix and turned, and put on the map only if it is
 *  not on it already: MapLibre's addTo takes a marker off first, so called
 *  at every fix it took the element out of the page and put it back, and
 *  dropped and added its six map listeners, once a second from the GPS
 *  and four times a second in a dry run. */
export function placeOwnShip(marker: Marker, map: MlMap, lngLat: [number, number], rotationDeg: number) {
  marker.setLngLat(lngLat).setRotation(rotationDeg);
  if (marker._map !== map) marker.addTo(map);
}
