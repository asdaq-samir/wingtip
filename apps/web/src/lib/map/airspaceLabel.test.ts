import { describe, expect, it } from "vitest";
import { airspaceFacts, airspaceHours } from "./airspaceLabel";

describe("an airspace's card, in words", () => {
  const wheeling = {
    name: "CHICAGO, WAUKEGAN REGIONAL CLASS D", floor_ft: 0, floor_sfc: true, ceiling_ft: 3000, ceiling_excluded: true,
    hours_code: "NOTAM", hours_remark: "Legal description references NOTAM",
  };

  it("names it as a place is written, and gives its floor and ceiling in feet MSL", () => {
    expect(airspaceFacts(wheeling)).toEqual({
      name: "Chicago, Waukegan Regional Class D", floor: "SFC", ceiling: "Up to but not including 3,000 ft MSL", hours: "By NOTAM",
    });
    expect(airspaceFacts({ ...wheeling, floor_ft: 1900, floor_sfc: false, ceiling_ft: 10000, ceiling_excluded: false }))
      .toMatchObject({ floor: "1,900 ft MSL", ceiling: "10,000 ft MSL" });
  });

  it("says when it is in effect as the file's hours code and remark do", () => {
    expect(airspaceHours("H24", null)).toBe("Continuous");
    expect(airspaceHours("NOTAM", "Legal description references NOTAM")).toBe("By NOTAM");
    expect(airspaceHours("NOTAM", "0600-2200 LOCAL")).toBe("By NOTAM. 0600-2200 local");
    // Cocoa Beach's, the file's only "RMK".
    expect(airspaceHours("RMK", "Airspace effective on a random basis")).toBe("Airspace effective on a random basis");
    expect(airspaceHours(null, null)).toBeNull();
  });
});
