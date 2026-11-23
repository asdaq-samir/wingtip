import { describe, expect, it } from "vitest";
import { declinationOf, fixRadialDistance, hoursOf, morseOf, radialOf, serviceVolume } from "./navaid";
import { threeFigures } from "./format";
import serviceVolumes from "./fixtures/serviceVolume.json";

// Joliet's VOR/DME as NASR files it (NAV_BASE, 2026-10-29): 2° E.
const JOT = { ident: "JOT", lat: 41.54641852, lon: -88.31841055, mag_var: 2 };

// The radials, the Morse, the hours and AIM 1-1-8's service volumes are the
// engine's, each case tested there (engine/facade/tests/wording.rs, over the
// shared fixtures/serviceVolume.json): here, that the card's station and
// point reach it and its answer is read back; the printing is the web's.
describe("navaid", () => {
  it("says a radial in three figures, north 360", () => {
    expect(threeFigures(0)).toBe("360");
    expect(threeFigures(359.6)).toBe("360");
    expect(threeFigures(45.2)).toBe("045");
  });

  it("takes the radial to the station's own declination: due north of a 2° E VOR is its 358 radial", () => {
    const off = radialOf(JOT, { lat: JOT.lat + 0.5, lon: JOT.lon })!;
    expect(threeFigures(off.radial)).toBe("358");
    expect(threeFigures(off.toCourse)).toBe("178");
    expect(off.nm).toBeCloseTo(30, 0);
    expect(radialOf({ ...JOT, mag_var: null }, JOT)).toBeNull();
  });

  it("puts a fix off the nearest VOR", () => {
    const far = { ident: "XXX", lat: 45, lon: -90, mag_var: 0 };
    expect(fixRadialDistance({ lat: JOT.lat + 0.2, lon: JOT.lon }, [far, JOT])).toBe("JOT 358° 12 nm");
  });

  it("sends the ident in Morse, letters apart", () => {
    expect(morseOf("JOT")).toBe("·−−−  −−−  −");
  });

  it("says a service volume, the hours and the declination", () => {
    const [terminal] = serviceVolumes.cases;
    expect(serviceVolume(terminal!.code)).toBe(terminal!.answer);
    expect(hoursOf("24")).toBe("Continuous");
    expect(declinationOf(-4)).toBe("4° W");
  });
});
