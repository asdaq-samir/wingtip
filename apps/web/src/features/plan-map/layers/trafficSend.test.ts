import { describe, expect, it, vi } from "vitest";
import type { Map as MlMap } from "maplibre-gl";
import { sendTraffic } from "./trafficSend";

const plane = (hex: string, lon: number, label = "") => ({
  type: "Feature" as const,
  geometry: { type: "Point" as const, coordinates: [lon, 44] },
  properties: { hex, label },
});

function fakeMap() {
  const source = { setData: vi.fn(), updateData: vi.fn(async () => {}) };
  return { map: { getSource: () => source } as unknown as MlMap, source };
}

describe("a frame of traffic sent to the map", () => {
  it("sends the first frame whole, then only the airplanes that moved, came, went or changed their look", () => {
    const { map, source } = fakeMap();
    sendTraffic(map, "traffic", [plane("a1", -88), plane("b2", -89)]);
    expect(source.setData).toHaveBeenCalledOnce();
    sendTraffic(map, "traffic", [plane("a1", -88.01), plane("b2", -89, "+05"), plane("c3", -90)]);
    expect(source.setData).toHaveBeenCalledOnce();
    expect(source.updateData).toHaveBeenLastCalledWith({
      remove: ["b2"],
      add: [plane("b2", -89, "+05"), plane("c3", -90)],
      update: [{ id: "a1", newGeometry: plane("a1", -88.01).geometry }],
    });
    sendTraffic(map, "traffic", [plane("c3", -90)]);
    expect(source.updateData).toHaveBeenLastCalledWith({ remove: ["a1", "b2"], add: [], update: [] });
  });

  it("sends nothing for a frame with nothing changed, and a hex heard twice once", () => {
    const { map, source } = fakeMap();
    sendTraffic(map, "traffic", [plane("a1", -88), plane("a1", -88)]);
    expect(source.setData).toHaveBeenCalledWith({ type: "FeatureCollection", features: [plane("a1", -88)] });
    sendTraffic(map, "traffic", [plane("a1", -88)]);
    expect(source.updateData).not.toHaveBeenCalled();
  });
});
