import { describe, expect, it } from "vitest";
import { placeWind } from "./placeWind";

describe("placeWind", () => {
  it("writes the wind true, in the hour row's form with its unit", () => {
    expect(placeWind({ wind_dir_true_deg: 250, wind_speed_kt: 3 })).toBe("250°T 3 kt");
    expect(placeWind({ wind_dir_true_deg: 240, wind_speed_kt: 12, wind_gust_kt: 20 })).toBe("240°T 12G20 kt");
    expect(placeWind({ wind_dir_true_deg: null, wind_speed_kt: 4 })).toBe("VRB 4 kt");
    expect(placeWind({ wind_dir_true_deg: 0, wind_speed_kt: 0 })).toBe("Calm");
    expect(placeWind({})).toBe("Not reported");
  });
});
