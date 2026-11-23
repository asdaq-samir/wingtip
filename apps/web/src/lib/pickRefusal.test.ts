import { describe, expect, it } from "vitest";
import { indexOf } from "./airportIndex";
import { pickRefusal } from "./pickRefusal";
import type { SearchPick } from "./oneSearch";

const index = indexOf(
  [
    ["KMSN", "Dane County Regional", "Madison", "WI", 0, 43.1, -89.3],
    ["KXYZ", "Gone Field", "Nowhere", "WI", 3, 43.0, -89.0],
  ],
  { KXYZ: "Closed indefinitely" },
);
const pick = (taken?: string[]): SearchPick => ({ label: "Add a Stop", fixes: true, onPick: () => {}, taken });

describe("pickRefusal", () => {
  it("names a closed field, whatever the case typed", () => {
    expect(pickRefusal(pick(), index, "kxyz")).toBe("Closed");
    expect(pickRefusal(pick(), index, "KMSN")).toBeNull();
  });
  it("names a point the route has already", () => {
    expect(pickRefusal(pick(["KMSN"]), index, "kmsn")).toBe("On the route already");
    expect(pickRefusal(pick(["KORD"]), index, "KMSN")).toBeNull();
  });
  it("says nothing outside a pick or before the index is read", () => {
    expect(pickRefusal(null, index, "KXYZ")).toBeNull();
    expect(pickRefusal(pick(), null, "KXYZ")).toBeNull();
    expect(pickRefusal(pick(), index, "")).toBeNull();
  });
});
