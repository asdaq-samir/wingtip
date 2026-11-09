import { test, expect, type Page } from "@playwright/test";
import { controlsInSight, openBrief, settle, sideDrawer, slow } from "./helpers";

/**
 * The assistant in the Brief (AskCard): a question typed into "Ask about
 * this flight" is answered as the planner streams it, with the reports
 * it rests on as chips, and a chip opens the report as sent. The Brief's
 * words sections (BriefWords) and the flight watch are answered here
 * too, so no billed Claude call is made, and the one that cannot be
 * reached shows its reason in place rather than a toast.
 */

const NDJSON = [
  { type: "tool", name: "weather_at", label: "The weather at KDLH" },
  { type: "text", text: "Yes: Duluth is reporting wind 270 at 12 gusting 18, " },
  { type: "text", text: "and the ceiling is 4,500 feet." },
  { type: "sources", sources: [{ id: "metar:KDLH", label: "METAR KDLH 1753Z", text: "KDLH 031753Z 27012G18KT 10SM BKN045 08/M02 A2992" }] },
  { type: "done" },
].map(line => JSON.stringify(line)).join("\n") + "\n";

const WORDS = {
  sentences: [{ text: "Nothing in the NOTAMs bears on this flight.", sources: ["notam:none"] }],
  sources: [{ id: "notam:none", label: "NOTAMs C81, KDLH", text: "No NOTAMs." }],
  model: "claude-haiku-5-5", unavailable: null,
};

/** The Brief's NOTAMs that matter: the engine's ranking with a line each. */
const RANKED = {
  notams: [
    { id: "DLH 11/012", kind: "notam", label: "NOTAM DLH 11/012", why: "Runway 09/27 at KDLH is closed while you are there.", worded: true,
      top: true, rank: 1, score: 85, tied: false, field: "KDLH", in_force: true, reasons: [], raw: "!DLH 11/012 DLH RWY 09/27 CLSD", starts: null, ends: null },
    { id: "C81 11/004", kind: "notam", label: "NOTAM C81 11/004", why: "Not in force while you are at C81; At C81, your departure.", worded: false,
      top: false, rank: 2, score: -45, tied: false, field: "C81", in_force: false, reasons: [], raw: "!C81 11/004 C81 SVC FUEL 100LL NOT AVBL", starts: null, ends: null },
  ],
  top: 1, coverage_since: "2026-10-19", unchecked: [], model: "claude-haiku-5-5", unavailable: null,
};

/** The planner's AI routes, each answered here (a URL predicate: a glob's
 *  `**` does not cross the path's slashes). */
async function mockAi(page: Page, asked: { body: unknown }[]) {
  await page.route(url => url.pathname === "/api/planner/assistant", route => {
    asked.push({ body: route.request().postDataJSON() });
    return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: NDJSON });
  });
  await page.route(url => url.pathname.startsWith("/api/planner/words/"), route => {
    const kind = route.request().url().split("/words/")[1]!;
    if (kind === "notams/ranked") return route.fulfill({ json: RANKED });
    if (kind === "weather") {
      return route.fulfill({ json: { sentences: [], sources: [], model: null, unavailable: "the model could not be reached" } });
    }
    return route.fulfill({ json: WORDS });
  });
  await page.route(url => /\/api\/flights\/\d+\/watch$/.test(url.pathname), route => route.fulfill({ status: 404, body: "" }));
}

test("a question in the Brief is answered with its sources, and a chip opens the report as sent", async ({ page }) => {
  const asked: { body: { messages: { role: string; content: string }[]; context: { dep: string; dest: string } } }[] = [];
  await mockAi(page, asked);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openBrief(page);
  const panel = sideDrawer(page);
  const field = panel.getByTestId("ask-field");
  await expect(field).toBeVisible({ timeout: slow(30000) });
  await field.fill("Can I make Duluth before dark with this wind?");
  await field.press("Enter");

  await expect(panel.getByTestId("ask-question")).toHaveText("Can I make Duluth before dark with this wind?");
  await expect(panel.getByTestId("ask-answer")).toContainText("ceiling is 4,500 feet", { timeout: slow(15000) });
  const chip = panel.getByTestId("ask-source");
  await expect(chip).toHaveText("METAR KDLH 1753Z");
  // The question went with the plan, as one user message.
  expect(asked).toHaveLength(1);
  expect(asked[0]!.body.messages).toEqual([{ role: "user", content: "Can I make Duluth before dark with this wind?" }]);
  expect(asked[0]!.body.context).toMatchObject({ dep: "C81", dest: "KDLH" });

  await chip.click();
  await expect(page.getByTestId("source-text")).toHaveText("KDLH 031753Z 27012G18KT 10SM BKN045 08/M02 A2992");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("source-dialog")).toHaveCount(0);

  // A second question carries the first and its answer back, unedited.
  await field.fill("And the return leg?");
  await field.press("Enter");
  await expect(panel.getByTestId("ask-turn")).toHaveCount(2);
  await expect.poll(() => asked.length).toBe(2);
  expect(asked[1]!.body.messages.map(m => m.role)).toEqual(["user", "assistant", "user"]);
  expect(asked[1]!.body.messages[1]!.content).toBe("Yes: Duluth is reporting wind 270 at 12 gusting 18, and the ceiling is 4,500 feet.");
});

test("the Brief's words come with their chips, and a reading the model could not write says so in place", async ({ page }) => {
  await mockAi(page, []);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openBrief(page);
  const panel = sideDrawer(page);
  // The NOTAMs that matter: the top one with its chip, the rest folded, the feed's day under them.
  await expect(panel.getByTestId("brief-notam")).toContainText("Runway 09/27 at KDLH is closed", { timeout: slow(30000) });
  await expect(panel.getByTestId("brief-notam-source")).toHaveText("NOTAM DLH 11/012");
  await expect(panel.getByTestId("brief-notam-folded")).toHaveCount(0);
  await panel.getByTestId("brief-notams-more").click();
  await expect(panel.getByTestId("brief-notam-folded")).toHaveCount(1);
  await expect(panel.getByTestId("brief-notams-credit")).toHaveText("FAA NOTAM feed since 19 Oct 2026");
  await expect(panel.getByTestId("brief-weather-words-unavailable")).toHaveText("The model could not be reached.");
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
});

test("the route's AI button opens the AI brief, its Ask at its foot, and the menu has no Ask of its own", async ({ page }) => {
  await mockAi(page, []);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const panel = sideDrawer(page);
  await controlsInSight(page);
  const ai = panel.getByTestId("route-brief");
  await expect(ai).toHaveAccessibleName(/^AI brief/, { timeout: slow(30000) });
  // The route's menu: the nav log in it, no Ask, no Profile (its own
  // button now).
  await panel.getByTestId("share-route").click();
  await expect(page.getByTestId("route-navlog")).toBeVisible({ timeout: slow(60000) });
  await expect(page.getByTestId("route-ask")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await ai.click();
  await expect(panel.getByTestId("brief-card")).toBeVisible();
  await expect(panel.getByTestId("ask-field")).toBeAttached({ timeout: slow(10000) });
});

test("Plan a trip proposes a trip from the pilot's words, and Use loads it into the route", async ({ page }) => {
  await mockAi(page, []);
  const leg = (kind: string, dep: string, dest: string, depart: string) => ({
    kind, change: { dep, dest, stops: ["KUES"], altitude_ft: 4500, depart }, altitude_ft: 4500, distance_nm: 113, ete_min: 74, fuel_gal: 11.2,
    arrive: null, depart_local: "", arrive_local: null, window: null, airspace: [], cautions: [], sources: [],
  });
  const lines = [
    { type: "tool", name: "route_options", label: "The ways to KOSH" },
    { type: "text", text: "Through Waukesha keeps you clear of the Chicago Class B." },
    { type: "plan", proposal: { legs: [leg("outbound", "C81", "KOSH", "2030-11-16T14:00:00Z")], rationale: "",
      unmet: ["The app has no fuel prices: no fuel price feed is read, so a price limit cannot be applied."] } },
    { type: "sources", sources: [] },
    { type: "done" },
  ];
  await page.route(url => url.pathname === "/api/planner/trip-plan", route => route.fulfill({
    status: 200, contentType: "application/x-ndjson", body: lines.map(l => JSON.stringify(l)).join("\n") + "\n" }));
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openBrief(page);
  const panel = sideDrawer(page);
  await panel.getByTestId("ask-plan-trip").click({ timeout: slow(30000) });
  await panel.getByTestId("trip-field").fill("VFR to Oshkosh Saturday morning, fuel stop under $6");
  await panel.getByTestId("trip-send").click();
  await expect(panel.getByTestId("trip-route")).toHaveText("C81 → KUES → KOSH", { timeout: slow(15000) });
  await expect(panel.getByTestId("trip-unmet")).toContainText("no fuel prices");
  // Nothing applied until the tap.
  await expect(page).toHaveURL(/dest=KDLH/);
  await panel.getByTestId("trip-use").click();
  await expect(page).toHaveURL(/dest=KOSH/, { timeout: slow(15000) });
});
