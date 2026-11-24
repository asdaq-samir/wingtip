import { expect, type Locator, type Page } from "@playwright/test";
import { drawn, slow } from "./helpers";

/** The traffic patterns the map draws, by name ("pattern-at-KDLH",
 *  "departure-at-C81": PatternsGl's lines). A line can come back once for each tile it crosses, so the names, each once. */
export const circuitsOf = (page: Page) => async () => [...new Set((await drawn(page, "patterns")).map((p) => String(p.name)))].sort();

/**
 * The route's Procedures (ProceduresRoute), FPL's list, at the pilot's ask: a field's
 * traffic pattern picked by its runway, kept in the address, and drawn on the map round the runway with its 45° entry (PatternLayer).
 */
/** A field's runway line opened where it is folded to the runway picked
 *  (PatternChips), at the owner's ask ("can the runway line collapse to
 *  the selected runway?"). */
export async function openRunways(field: Locator) {
  // The field's runways in first: the list is drawn again as a sheet over
  // it closes, the field gone from it for a moment.
  await expect(field.getByTestId("procedure-pattern").first()).toBeVisible({ timeout: slow(20000) });
  // The runway into the wind may be picked for the pilot after the line
  // shows, folding it as it comes (ProceduresRoute's intoWind): opened again
  // until it stays open.
  const folded = field.locator("[data-folded]");
  // That pick waited for first, where the field has a wind to pick into:
  // a line opened before it is folded by it, as the owner asked
  // (e6d13391), and on a slow runner it came after the loop below had
  // seen the line open and gone on, the runway then clicked gone under the
  // finger (the mobile project, CI 2026-10-28, and here on the merged
  // bundle). Calm, nothing is picked, and the line is open already.
  await folded
    .first()
    .waitFor({ timeout: slow(10000) })
    .catch(() => {});
  await expect(async () => {
    if (await folded.count()) await folded.click();
    await expect(folded).toHaveCount(0, { timeout: 1500 });
  }).toPass({ timeout: slow(20000) });
}

// KDLH's ILS as the planner would send it (wingtip.procedures), stubbed: the
// FAA's file is not read on CI's runner.
export const LIST = {
  airport: "KDLH",
  cycle: "261001",
  procedures: [
    { kind: "approach", id: "I09", name: "ILS RWY 09", runway: "09", transitions: ["DLH"], runway_transitions: [] },
    { kind: "arrival", id: "SKETC1", name: "SKETC1", runway: null, transitions: [], runway_transitions: ["ALL"] },
  ],
};
export const DRAWN = {
  airport: "KDLH",
  kind: "approach",
  id: "I09",
  name: "ILS RWY 09",
  transition: "DLH",
  cycle: "261001",
  lines: [
    {
      role: "transition",
      name: "DLH",
      points: [
        [46.8, -92.36],
        [46.84, -92.4],
      ],
    },
    {
      role: "final",
      name: null,
      points: [
        [46.84, -92.4],
        [46.84, -92.3],
        [46.842, -92.21],
      ],
    },
    {
      role: "missed",
      name: null,
      points: [
        [46.842, -92.21],
        [46.843, -92.17],
        [46.8, -92.36],
      ],
    },
  ],
  holds: [
    {
      fix: "DLH",
      turn: "R",
      inbound_deg: 90,
      missed: true,
      points: [
        [46.8, -92.36],
        [46.79, -92.34],
        [46.78, -92.36],
        [46.8, -92.36],
      ],
    },
  ],
  fixes: [
    { ident: "DLH", lat: 46.8, lon: -92.36, roles: ["hold"], min_ft: 3500, max_ft: null, speed_kt: null, missed: false },
    { ident: "OFOFO", lat: 46.84, lon: -92.4, roles: ["IAF", "IF"], min_ft: 3500, max_ft: null, speed_kt: null, missed: false },
    { ident: "FAKER", lat: 46.84, lon: -92.3, roles: ["FAF"], min_ft: 2700, max_ft: 2700, speed_kt: null, missed: false },
  ],
};

// KDLH's arrival in the stubbed list, drawn: its common route alone.
export const ARRIVAL_DRAWN = {
  airport: "KDLH",
  kind: "arrival",
  id: "SKETC1",
  name: "SKETC1",
  transition: null,
  cycle: "261001",
  lines: [
    {
      role: "common",
      name: null,
      points: [
        [46.95, -92.6],
        [46.84, -92.4],
      ],
    },
  ],
  holds: [],
  fixes: [{ ident: "OFOFO", lat: 46.84, lon: -92.4, roles: [], min_ft: null, max_ft: null, speed_kt: null, missed: false }],
};

/** A procedure picked at a field, out on the field's line once the line
 *  is opened, as its runways are (the owner, 2026-11-23: "Keep the pill
 *  hidden like runway"): `field` the field's region ("KDLH · Arrive"),
 *  its rows then on the line, or an approach's boxes after it (loaded,
 *  its missed approach). A no-op where the line is already open. */
export async function unfoldProcedure(field: Locator, kind: "approach" | "arrival" | "departure") {
  const toggle = field.getByTestId("timeline-toggle");
  await expect(toggle).toBeVisible({ timeout: slow(20000) });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  // The field and its procedures one group, the box round them both.
  await expect(field).toHaveAttribute("data-testid", "field-group");
  // Its rows out, where it has rows on the line (an approach only loaded
  // has its box instead).
  if (kind !== "approach") await expect(field.locator(`[data-testid=procedure-rows][data-kind=${kind}]`)).toBeVisible();
}
