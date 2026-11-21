import { describe, expect, it } from "vitest";
import { checklistOf } from "./checklist";
import checklistFixture from "./fixtures/checklist.json";

// How a checklist is read is the engine's, tested once there
// (engine/facade/tests/pilot.rs, the same cases and this fixture): here,
// that the page's reader is the engine's, case by case.
// The shared fixture the iPhone app's ChecklistText (PilotLogic.swift) is
// tested against too (WingtipTests/SharedFixturesTests.swift), so the two
// read a checklist alike (docs/NATIVE.md).
describe("the shared checklist fixture", () => {
  it.each(checklistFixture.cases.map((c, i) => ({ ...c, i })))("case $i", ({ text, checklist }) => {
    expect(checklistOf(text)).toEqual(checklist);
  });
});
