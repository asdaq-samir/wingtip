import { describe, expect, it } from "vitest";
import type { LogbookEntry } from "../../../lib/api/types";
import { blankEntry, deletedWords, requestOf } from "./logbookEntry";

const logged: LogbookEntry = {
  ...blankEntry("N12345"),
  id: 41,
  flownOn: "2026-11-03",
  route: "KMSN-KDLH",
  aircraftType: null,
  remarks: null,
  totalHours: 2.3,
  approaches: 2,
  fromTrack: true,
  flightId: 7,
};

describe("a logged flight", () => {
  it("goes back to the server as it was, its links kept and its id left out", () => {
    const request = requestOf(logged);
    expect(request).not.toHaveProperty("id");
    expect(request).toMatchObject({
      flownOn: "2026-11-03",
      route: "KMSN-KDLH",
      totalHours: 2.3,
      approaches: 2,
      fromTrack: true,
      flightId: 7,
    });
    // The form's fields are text: an empty column is blank, not null.
    expect(request.aircraftType).toBe("");
    expect(request.remarks).toBe("");
  });

  it("is named by its day and route when it goes", () => {
    expect(deletedWords(logged)).toBe("3 Nov 2026 KMSN-KDLH Deleted");
    expect(deletedWords({ flownOn: "2026-11-03", route: null })).toBe("3 Nov 2026 Deleted");
  });

  it("starts a new one today in the airplane picked, one landing by day", () => {
    const blank = blankEntry("N12345");
    expect(blank.aircraft).toBe("N12345");
    expect(blank.dayLandings).toBe(1);
    expect(blank.flownOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
