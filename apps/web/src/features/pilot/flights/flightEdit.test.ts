import { describe, expect, it } from "vitest";
import { flightEdit, flightEditProblem, flightTitle, NAME_MAX, NOTES_MAX } from "./flightEdit";

const route = { departureIdent: "C81", destinationIdent: "KDLH", stops: ["KMSN"] };

describe("a saved flight's title", () => {
  it("is the pilot's name for it", () => {
    expect(flightTitle({ ...route, name: "Lake Superior run" })).toBe("Lake Superior run");
  });

  it("is its route where it has no name, or only spaces", () => {
    const unnamed = flightTitle({ ...route, name: null });
    expect(unnamed).toContain("C81");
    expect(unnamed).toContain("KDLH");
    expect(flightTitle({ ...route, name: "   " })).toBe(unnamed);
  });
});

describe("a saved flight's edit", () => {
  const flight = { name: "Lake run", notes: "Fuel at KMSN" };

  it("sends nothing when nothing changed", () => {
    expect(flightEdit(flight, "Lake run", "Fuel at KMSN")).toBeNull();
    expect(flightEdit(flight, " Lake run ", "Fuel at KMSN\n")).toBeNull();
    expect(flightEdit({ name: null, notes: null }, "", "")).toBeNull();
  });

  it("keeps what did not change and sends what did", () => {
    expect(flightEdit(flight, "Superior", "Fuel at KMSN")).toEqual({ name: "Superior", notes: null });
    expect(flightEdit(flight, "Lake run", "Fuel at KRYV")).toEqual({ name: null, notes: "Fuel at KRYV" });
  });

  it("clears a field emptied by sending it blank", () => {
    expect(flightEdit(flight, "", "Fuel at KMSN")).toEqual({ name: "", notes: null });
    expect(flightEdit(flight, "Lake run", "  ")).toEqual({ name: null, notes: "" });
  });

  it("says a name or notes too long before they are sent, as the gateway would", () => {
    expect(flightEditProblem("a".repeat(NAME_MAX), "")).toBeNull();
    expect(flightEditProblem("a".repeat(NAME_MAX + 1), "")).toMatch(/at most 80/);
    expect(flightEditProblem("", "a".repeat(NOTES_MAX + 1))).toMatch(/at most 2,000/);
  });
});
