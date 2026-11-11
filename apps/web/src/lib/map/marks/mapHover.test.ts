import { afterEach, describe, expect, test } from "vitest";
import { hoverLeg, hoverTfr, mouseHover, useMapHover } from "./mapHover";

describe("what a mouse lights on the map", () => {
  afterEach(() => useMapHover.setState({ leg: null, tfr: null }));

  test("a mouse's pointer lights a row's thing and its leaving puts it out; a finger's or a pen's does nothing", () => {
    const leg = [
      { lat: 42.4, lon: -88.1 },
      { lat: 46.8, lon: -92.2 },
    ];
    const row = mouseHover(
      () => hoverLeg(leg),
      () => hoverLeg(null),
    );
    row.onPointerEnter({ pointerType: "touch" });
    expect(useMapHover.getState().leg).toBeNull();
    row.onPointerEnter({ pointerType: "pen" });
    expect(useMapHover.getState().leg).toBeNull();
    row.onPointerEnter({ pointerType: "mouse" });
    expect(useMapHover.getState().leg).toEqual(leg);
    row.onPointerLeave({ pointerType: "mouse" });
    expect(useMapHover.getState().leg).toBeNull();
  });

  test("a TFR is lit by its NOTAM id, apart from a leg", () => {
    hoverTfr("6/1234");
    hoverLeg([{ lat: 1, lon: 2 }]);
    expect(useMapHover.getState()).toMatchObject({ tfr: "6/1234", leg: [{ lat: 1, lon: 2 }] });
    hoverTfr(null);
    expect(useMapHover.getState().tfr).toBeNull();
  });
});
