import { describe, expect, it } from "vitest";
import type { Aircraft } from "../../../lib/api/types";
import { blankEntry } from "./logbookEntry";
import { requestOfForm, withSavedKind } from "./entryKind";

// 14 CFR 61.5(b)'s words, as the gateway keeps them.
const cub = { tailNumber: "N9TW", kind: { category: "Airplane", aircraftClass: "Single-engine land", tailwheel: true } } as Aircraft;
const plain = { tailNumber: "N123AB", kind: { category: null, aircraftClass: null, tailwheel: null } } as Aircraft;

describe("an entry's category, class and gear (14 CFR 61.57(a)(1)(ii))", () => {
  it("come from the profile of the airplane it names, however its tail is typed, and say whose", () => {
    const { entry, from } = withSavedKind(blankEntry(" n9tw"), [plain, cub]);
    expect(entry).toMatchObject({ category: "Airplane", aircraftClass: "Single-engine land", tailwheel: true });
    expect(from).toBe("N9TW");
  });

  it("stay not said where the profile says nothing, and as they were where the entry says them", () => {
    expect(withSavedKind(blankEntry("N123AB"), [plain, cub]).from).toBeNull();
    const own = { ...blankEntry("N9TW"), tailwheel: false };
    expect(withSavedKind(own, [cub])).toEqual({ entry: own, from: null });
  });

  it("go to the gateway as none where the form's box is empty, never an empty word or 0", () => {
    const typed = { ...blankEntry(), category: "", aircraftClass: "", tailwheel: "", fullStopLandings: "", flightId: "" } as never;
    expect(requestOfForm(typed)).toMatchObject({
      category: null,
      aircraftClass: null,
      tailwheel: null,
      fullStopLandings: null,
      flightId: null,
    });
    const said = { ...blankEntry(), tailwheel: false, fullStopLandings: 0 };
    expect(requestOfForm(said)).toMatchObject({ tailwheel: false, fullStopLandings: 0 });
  });
});
