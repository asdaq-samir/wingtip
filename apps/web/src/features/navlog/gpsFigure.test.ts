import { describe, expect, it } from "vitest";
import { M_PER_FT } from "../../lib/geo";
import { gpsFigure } from "./gpsFigure";

describe("gpsFigure", () => {
  it("is not in the strip with no position", () => {
    expect(gpsFigure(null)).toBeNull();
  });

  it("is a dash where the position gives no altitude", () => {
    const f = gpsFigure({ altitudeFt: null });
    expect(f).toMatchObject({ label: "GPS alt", value: "—", testId: "strip-gps-alt" });
    expect(f?.unit).toBeUndefined();
  });

  it("gives feet to the nearest 10, named GPS altitude", () => {
    // 914 m above the ellipsoid is 2,998.7 ft (914 / M_PER_FT).
    expect(gpsFigure({ altitudeFt: 914 / M_PER_FT })).toMatchObject({
      label: "GPS alt",
      value: "3,000",
      unit: "ft",
      said: "GPS altitude, 3,000 feet",
    });
    expect(gpsFigure({ altitudeFt: 1434 })?.value).toBe("1,430");
    expect(gpsFigure({ altitudeFt: 1435 })?.value).toBe("1,440");
  });

  it("keeps a height below the ellipsoid, which a coastal fix can give", () => {
    expect(gpsFigure({ altitudeFt: -32 })?.value).toBe("-30");
  });
});
