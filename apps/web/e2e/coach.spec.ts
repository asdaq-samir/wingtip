import { test, expect } from "@playwright/test";
import { library, openConsole, showTabs } from "./helpers";

/**
 * The Logbook's Coach: on the pilot's ask, the engine's proficiency plan
 * (through the planner's POST /api/pilot/coach) with its reminder, its
 * sessions at their fields and WINGS's "may count". The planner's answer
 * is stubbed:
 * the plan's rules are the engine's tests' (engine/facade/tests/coach.rs).
 */

const PLAN = {
  today: "2026-11-09",
  due: [
    {
      key: "night_passengers",
      id: "due:night_passengers",
      label: "Passengers at night",
      rule: "14 CFR 61.57(b)",
      until: "2026-11-18",
      from: null,
      days_left: 9,
      status: "due_soon",
      detail: "90 days from the third most recent night full-stop landing (61.57(b))",
    },
  ],
  reminders: [
    {
      key: "night_passengers",
      text: "Passengers at night: current until 18 Nov 2026, in 9 days (14 CFR 61.57(b)).",
      until: "2026-11-18",
      days_left: 9,
    },
  ],
  evidence: [
    {
      id: "ev:1",
      flown_on: "2026-10-25",
      place: "KMSN",
      area: "unstable_approach",
      text: "Off the course or glidepath 413 ft above the field, under the 500 ft gate (AC 61-98D 2.1.4)",
    },
  ],
  weak_areas: [{ key: "unstable_approach", label: "Stabilized approaches", acs: ["IR.VI.A", "IR.VI.B", "PA.IV.B"], evidence: ["ev:1"] }],
  sessions: [
    {
      id: "session:1",
      key: "night_passengers",
      practise: "Three takeoffs and three landings to a full stop, from 1 hour after sunset (61.57(b))",
      why: ["due:night_passengers"],
      place: { ident: "C29", name: "Middleton Muni - Morey Fld", distance_nm: 0, approach: null },
      minutes: 60,
      instructor: false,
      wings: null,
    },
    {
      id: "session:2",
      key: "unstable_approach",
      practise: "Stabilized approaches by 500 ft above the field (AC 61-98D 2.1.4)",
      why: ["ev:1"],
      place: { ident: "KMSN", name: "Dane County Rgnl/Truax Fld", distance_nm: 7.6, approach: "ILS OR LOC RWY 36" },
      minutes: 60,
      instructor: true,
      wings: { area: "Takeoffs and landings", acs: "PA.IV.B", note: "May count toward a WINGS flight activity" },
    },
  ],
};

test("the Coach makes a plan from the logbook", async ({ page }) => {
  const asked: Record<string, unknown>[] = [];
  await page.route(
    (url) => url.pathname === "/api/logbook",
    (route) => route.fulfill({ json: [] }),
  );
  await page.route(
    (url) => url.pathname === "/api/flights",
    (route) => route.fulfill({ json: [] }),
  );
  await page.route(
    (url) => url.pathname === "/api/training",
    (route) => route.fulfill({ json: { experience: [], knowledgeTestCodes: [], endorsements: [], lessons: [] } }),
  );
  await page.route(
    (url) => url.pathname === "/api/planner/pilot/coach",
    async (route) => {
      asked.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ json: PLAN });
    },
  );

  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const console = page.getByTestId("console-sheet");
  await library(console, "Logbook");
  await console.getByTestId("coach-row").click();
  await console.getByTestId("coach-make").click();

  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toMatchObject({ entries: [], debriefs: [] });
  await expect(console.getByTestId("coach-reminder")).toContainText("Passengers at night: current until 18 Nov 2026, in 9 days");
  await expect(console.getByTestId("coach-session")).toHaveCount(2);
  // Verdict first: the next session in one line, over Make It Again, and
  // the step said in the status line.
  await expect(console.getByTestId("coach-next")).toContainText("Next: Three takeoffs and three landings");
  await expect(console.getByTestId("coach-make")).toHaveText("Make It Again");
  await expect(console.getByTestId("coach-status")).toContainText("Plan made: 2 sessions.");
  await expect(console.getByTestId("coach-session").nth(1)).toContainText("KMSN, ILS OR LOC RWY 36");
  await expect(console.getByTestId("coach-session").nth(1)).toContainText("May count toward WINGS: Takeoffs and landings, ACS PA.IV.B");
});
