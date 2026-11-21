import { beforeEach, describe, expect, it } from "vitest";
import { forgetKeptTracks, keepTrack, keptTrack } from "./track";

describe("forgetKeptTracks", () => {
  beforeEach(() => localStorage.clear());

  it("forgets every flight's kept track and nothing else the app keeps", () => {
    const track = { source: "foreflight.kml", points: [{ t: 1, lat: 41.9, lon: -88.2, altFt: 900 }] };
    keepTrack(7, track);
    keepTrack(12, track);
    localStorage.setItem("wingtip.theme", "dark");
    expect(keptTrack(7)).toEqual(track);

    forgetKeptTracks();

    expect(keptTrack(7)).toBeNull();
    expect(keptTrack(12)).toBeNull();
    expect(localStorage.getItem("wingtip.track.7")).toBeNull();
    expect(localStorage.getItem("wingtip.track.12")).toBeNull();
    expect(localStorage.getItem("wingtip.theme")).toBe("dark");
  });
});
