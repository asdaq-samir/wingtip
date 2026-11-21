import { describe, expect, it, vi } from "vitest";
import type { Map as MlMap, Marker } from "maplibre-gl";
import { placeOwnShip } from "./ownShipMarker";

/** A marker as MapLibre's keeps its map: `_map` set by addTo, gone on remove. */
function fakeMarker() {
  const marker = {
    _map: undefined as unknown,
    setLngLat: vi.fn(() => marker),
    setRotation: vi.fn(() => marker),
    addTo: vi.fn((map: unknown) => {
      marker._map = map;
      return marker;
    }),
    remove: vi.fn(() => {
      marker._map = undefined;
      return marker;
    }),
  };
  return marker;
}

describe("placeOwnShip", () => {
  it("puts the mark on the map once, and only moves it at the fixes after", () => {
    const map = {} as MlMap;
    const marker = fakeMarker();
    for (let i = 0; i < 5; i++) placeOwnShip(marker as unknown as Marker, map, [-89 + i / 100, 43], i * 10);
    expect(marker.addTo).toHaveBeenCalledTimes(1);
    expect(marker.setLngLat).toHaveBeenCalledTimes(5);
    expect(marker.setRotation).toHaveBeenLastCalledWith(40);
  });

  it("puts it back after it was taken off (own ship with no fix)", () => {
    const map = {} as MlMap;
    const marker = fakeMarker();
    placeOwnShip(marker as unknown as Marker, map, [-89, 43], 0);
    marker.remove();
    placeOwnShip(marker as unknown as Marker, map, [-89, 43], 0);
    expect(marker.addTo).toHaveBeenCalledTimes(2);
  });
});
