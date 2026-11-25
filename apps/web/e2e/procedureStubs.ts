import { expect, type Locator, type Page } from "@playwright/test";
import { drawn, slow } from "./helpers";

/** The traffic patterns the map draws, by name ("pattern-at-KDLH",
 *  "departure-at-C81": PatternsGl's lines). A line can come back once for each tile it crosses, so the names, each once. */
export const circuitsOf = (page: Page) => async () => [...new Set((await drawn(page, "patterns")).map((p) => String(p.name)))].sort();

/**
 * The route's Procedures (ProceduresRoute), FPL's list, at the pilot's ask: a field's
 * traffic pattern picked by its runway, kept in the address, and drawn on the map round the runway with its 45° entry (PatternLayer).
 */
/** A field's runway menu opened from its pill on FPL's list (RunwayPill;
 *  the owner, 2026-11-25: "we don't need the folding runways"): its
 *  runways each a radio item, the one picked checked. */
export async function openRunways(field: Locator) {
  const pill = field.getByTestId("runway-pill").first();
  await expect(pill).toBeVisible({ timeout: slow(20000) });
  await pill.click();
  await expect(runwayOptions(field.page()).first()).toBeVisible();
}

/** The runway menu's runways, open (openRunways). */
export const runwayOptions = (page: Page) => page.getByTestId("runway-option");

/** A runway in the open menu the pilot may pick and has not. */
export const otherRunway = (page: Page) =>
  runwayOptions(page).and(page.locator(':not([data-disabled]):not([aria-checked="true"])')).first();

/** A runway option's number, from its name ("Runway 9, into the wind"). */
export const runwayOf = async (option: Locator) => /^Runway (\w+)/.exec((await option.getAttribute("aria-label")) ?? "")![1]!;

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
  // Its sections folded at first (2026-11-24): the kind's opened by its head.
  const section = field.locator(`[data-kind=${kind}]`).first();
  await expect(section).toBeVisible();
  if ((await section.getAttribute("data-section-folded")) !== null) await section.getByTestId("section-fold").first().click();
  await expect(section).not.toHaveAttribute("data-section-folded", "");
  // Its rows out, where it has rows on the line (an approach only loaded
  // has its box instead).
  if (kind !== "approach") await expect(field.locator(`[data-testid=procedure-rows][data-kind=${kind}]`)).toBeVisible();
}
