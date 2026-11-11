import { describe, expect, it } from "vitest";
import fixture from "../../fixtures/airportWeatherMarks.json";
import { callEngine } from "../../engine/engine";
import { ceilingWords, spokenWeather, stationLines, visibilityWords, weatherMarksOf, type PinWeather } from "./airportWeather";
import { barbId, stationPictures } from "./stationModel";

const pin = (w: Partial<PinWeather>): PinWeather => ({
  wind_dir_true_deg: null,
  wind_speed_kt: null,
  wind_gust_kt: null,
  visibility_sm: null,
  wx: null,
  ceiling_ft: null,
  ceiling_cover: null,
  ceiling_unknown: false,
  crosswind_kt: null,
  ...w,
});

// The rules the map calls, from the fixture the engine and the phones read.
describe("the airport weather marks, as the shared fixture says", () => {
  it("least_crosswind", () => {
    for (const c of fixture.leastCrosswind) expect(callEngine("least_crosswind", c.input as never), c.why).toEqual(c.answer);
  });

  it("the arrow shown or not, red or not", () => {
    for (const c of fixture.windArrow) {
      const marks = weatherMarksOf(
        pin({ wind_dir_true_deg: 220, wind_speed_kt: c.input.speed_kt, wind_gust_kt: c.input.gust_kt, crosswind_kt: c.input.crosswind_kt }),
        c.input.demonstrated_kt,
      );
      expect(marks.arrow !== null, c.why).toBe(c.answer.shown);
      expect(marks.over, c.why).toBe(c.answer.over);
    }
  });

  it("each barb the engine answers has its picture", () => {
    const drawn = new Set(stationPictures().map(([id]) => id));
    for (const c of fixture.windBarb) {
      const barb = callEngine("wind_barb", { speed_kt: c.speed_kt });
      expect(barb, c.why).toEqual(c.answer);
      expect(drawn.has(barbId(barb)), c.why).toBe(true);
    }
  });
});

describe("a field's marks", () => {
  it("write the station model's two lines from the METAR as decoded", () => {
    expect(stationLines(pin({ visibility_sm: 2, wx: "BR", ceiling_ft: 800, ceiling_cover: "OVC" }))).toBe("2 SM BR\nOVC 008");
    expect(stationLines(pin({ ceiling_ft: 200, ceiling_cover: "VV" }))).toBe("VV 002");
    // A report read before the cover was kept: its height alone.
    expect(ceilingWords(pin({ ceiling_ft: 800 }))).toBe("CIG 008");
    expect(stationLines(pin({ visibility_sm: 10 }))).toBe("10 SM");
    expect(visibilityWords(0.5)).toBe("1/2 SM");
    expect(visibilityWords(1.5)).toBe("1 1/2 SM");
    // A layer sent with no height is a ceiling not known, not none (14 CFR 1.1).
    expect(ceilingWords(pin({ ceiling_unknown: true }))).toBe("CIG ///");
  });

  it("never red with no airplane, and no arrow for a light wind", () => {
    const gusty = pin({ wind_dir_true_deg: 220, wind_speed_kt: 18, wind_gust_kt: 26, crosswind_kt: 17 });
    expect(weatherMarksOf(gusty, null)).toMatchObject({ arrow: "wx-arrow|ink", over: false, gusts: "18G26" });
    expect(weatherMarksOf(gusty, 15)).toMatchObject({ arrow: "wx-arrow|over", over: true });
    expect(weatherMarksOf(pin({ wind_dir_true_deg: 220, wind_speed_kt: 6 }), 15)).toMatchObject({ arrow: null, gusts: "" });
    // A variable wind: no way to point either, its label still said.
    expect(weatherMarksOf(pin({ wind_speed_kt: 6, wind_gust_kt: 16 }), 15)).toMatchObject({ arrow: null, barb: null, gusts: "VRB6G16" });
  });

  it("are said to a screen reader with the category and the wind", () => {
    expect(spokenWeather("KJVL", "IFR", pin({ wind_dir_true_deg: 220, wind_speed_kt: 18, wind_gust_kt: 26 }))).toBe(
      "KJVL, IFR, wind 220 at 18 gusting 26",
    );
    expect(spokenWeather("KMSN", "VFR", pin({ wind_speed_kt: 0 }))).toBe("KMSN, VFR, wind calm");
  });
});
