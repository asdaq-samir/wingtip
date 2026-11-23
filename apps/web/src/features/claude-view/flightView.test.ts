import { describe, expect, it } from "vitest";
import fixture from "../../lib/fixtures/flightView.json";
import { answerOf, approachChanges, chartTiles, minutesTo, newer, saveChange, type Answer, type ViewApproach } from "./flightView";

// The planner's own answer (test_mcp_edits writes it): C81 to KDLH by the
// fuel stop KMSN on N123AB, the ILS loaded at KDLH.
const answer = fixture as unknown as Answer;

describe("the connector's answer as the live view reads it", () => {
  it("is taken from a tool's structured content, and nothing else is", () => {
    expect(answerOf(fixture)?.view.points.map((p) => p.ident)).toEqual(["C81", "KMSN", "KDLH"]);
    expect(answerOf({ deleted: { id: 12 } })).toBeNull();
    expect(answerOf(undefined)).toBeNull();
  });

  it("knows the newer of two answers by the server's time, then its count", () => {
    const v = answer.view;
    expect(newer({ ...v, created_at: 2 }, { ...v, created_at: 1 })).toBe(true);
    expect(newer({ ...v, created_at: 1, seq: 3 }, { ...v, created_at: 1, seq: 4 })).toBe(false);
  });

  it("draws the sectional's tiles from Wingtip's own address", () => {
    expect(chartTiles(answer.view)).toMatch(/^https:\/\/wingtip\.test\/api\/planner\/chart-tile\/sec\/\{z\}\/\{x\}\/\{y\}(@2x)?\.png\?c=/);
    expect(chartTiles({ ...answer.view, origin: null })).toBeNull();
  });

  it("gives each point the legs' minutes up to it, and none with no airplane", () => {
    const minutes = minutesTo(answer.view);
    expect(minutes[0]).toBeNull();
    expect(minutes[1]).toBeGreaterThan(0);
    expect(minutes[2]).toBeGreaterThan(minutes[1]!);
    const legs = answer.view.legs.map((l) => ({ ...l, ete_min: null as unknown as number }));
    expect(minutesTo({ ...answer.view, legs })).toEqual([null, null, null]);
  });
});

describe("what a tap in the live view asks of the connector", () => {
  const loaded = answer.view.approaches[0]!;
  it("offers a loaded approach Activate and Remove", () => {
    expect(approachChanges(loaded).map((c) => [c.label, c.args.action])).toEqual([
      ["Activate", "activate"],
      ["Remove", "remove"],
    ]);
  });

  it("offers an active one Deactivate, its missed approach and Remove", () => {
    const active: ViewApproach = { ...loaded, loaded: false, missed: false };
    expect(approachChanges(active).map((c) => c.label)).toEqual(["Deactivate", "Unsuspend Missed", "Remove"]);
    expect(approachChanges({ ...active, missed: true })[1]!.args).toEqual({ airport: "KDLH", action: "suspend_missed" });
  });

  it("saves a new flight, or over the saved one it came from, named by that flight's own route", () => {
    expect(saveChange(answer.view)).toMatchObject({ tool: "save_flight_plan", label: "Save" });
    const saved = { id: 12, departure: "KMSN", destination: "KDLH", same_route: true };
    expect(saveChange({ ...answer.view, saved })).toMatchObject({ tool: "update_saved_flight_from_view", label: "Update KMSN–KDLH" });
    // Another route over a saved flight is the model's to ask, never a tap.
    expect(saveChange({ ...answer.view, saved: { ...saved, same_route: false } })).toMatchObject({
      tool: "save_flight_plan",
      label: "Save as New",
    });
  });
});
