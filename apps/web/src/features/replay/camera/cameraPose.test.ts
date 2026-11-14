import { describe, expect, it } from "vitest";
import { MAP } from "../../../lib/tokens";
import { lookAt, offset, poseOf } from "./cameraPose";

const flat = () => 0;
const plane = { lat: 45, lon: -93, altFt: 3000, trackDeg: 90 };

describe("the replay's cameras", () => {
  it("puts a point metres away on a bearing, near enough for a camera", () => {
    const east = offset(45, -93, 90, 1000);
    expect(east.lat).toBeCloseTo(45, 6);
    expect((east.lon + 93) * 111_320 * Math.cos((45 * Math.PI) / 180)).toBeCloseTo(1000, 0);
  });

  it("looks down at something below it, and no flatter than the map tilts", () => {
    const below = lookAt({ lat: 45, lon: -93, altM: 1000 }, { lat: 45, lon: -93, altM: 0 });
    expect(below.pitch).toBe(0);
    const far = lookAt({ lat: 45, lon: -93, altM: 10 }, { lat: 45.5, lon: -93, altM: 10 });
    expect(far.bearing).toBeCloseTo(0, 6);
    expect(far.pitch).toBe(MAP.pitchMax);
  });

  it("chases from behind the airplane's track, above it, looking at it", () => {
    const pose = poseOf("chase", plane, flat, { clockS: 0, tower: null });
    expect(pose.kind).toBe("eye");
    if (pose.kind !== "eye") return;
    expect(pose.lon).toBeLessThan(plane.lon);
    expect(pose.altM).toBeGreaterThan(3000 * 0.3048);
    expect(pose.bearing).toBeCloseTo(90, 0);
  });

  it("sits in the seat looking down the track, and never under the ground", () => {
    const pose = poseOf("cockpit", { ...plane, altFt: 0 }, () => 200, { clockS: 0, tower: null });
    expect(pose).toMatchObject({ kind: "eye", bearing: 90, pitch: 72, altM: 215 });
  });

  it("turns the tower to follow the airplane from where it stands", () => {
    const pose = poseOf("tower", plane, flat, { clockS: 0, tower: { lat: 45, lon: -93.1 } });
    expect(pose).toMatchObject({ kind: "eye", lat: 45, lon: -93.1, altM: 30 });
    if (pose.kind === "eye") expect(pose.bearing).toBeCloseTo(90, 0);
  });

  it("looks straight down, north up, from the top", () => {
    expect(poseOf("top", plane, flat, { clockS: 0, tower: null })).toEqual({ kind: "over", lat: 45, lon: -93, bearing: 0 });
  });

  it("goes round the airplane with the screen's time on the orbit", () => {
    const a = poseOf("orbit", plane, flat, { clockS: 0, tower: null });
    const b = poseOf("orbit", plane, flat, { clockS: 15, tower: null });
    expect(a).not.toEqual(b);
  });
});
