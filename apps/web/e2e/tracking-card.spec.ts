import { test, expect } from "@playwright/test";
import { closeCard, frontSheet, grabberTo, inSheet, settle, settled, showSearch, sideDrawer, slow } from "./helpers";
import { DETAIL, sky } from "./trackingSky";
// The parked features it exercises, on (Settings' Extras, src/lib/extras).

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("an airplane opened is in the Aircraft card's Recents, and one starred on its card is in its Favorites, as airports are", async ({
  page,
}) => {
  await sky(page);
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  // One card for it (the owner's design, 2026-11-26), titled with its N-number, its call sign under it.
  const card = page.getByTestId("airplane-profile");
  await expect(card).toContainText("N14511", { timeout: slow(15_000) });
  await expect(card).toContainText("UAL2088");
  const star = card.getByTestId("airplane-favorite");
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await closeCard(page, "sheet-card-close");
  await page.goto("/app/plan");
  await settle(page);
  // The one search's page: the airplane in its Favorites and its Recents,
  // after the airports' (the traffic's own page went for it, 2026-11-14).
  await showSearch(page);
  const home = sideDrawer(page).getByTestId("search-home");
  await expect(home.getByTestId("pill-aircraft-favorite")).toHaveCount(1);
  await expect(home.getByTestId("pill-aircraft-favorite")).toContainText("N14511");
  await expect(home.getByTestId("airport-recents").getByTestId("aircraft-recent").first()).toContainText("N14511");
  // A tile opens its card again, pulled into sight first: the Favorites
  // sit under Nearest and Find Nearby, below the half sheet's edge.
  await inSheet(page, home.getByTestId("pill-aircraft-favorite"));
  await home.getByTestId("pill-aircraft-favorite").click();
  await expect(page).toHaveURL(/[?&]flight=a0b7d8/);
  await expect(page.getByTestId("airplane-profile").getByTestId("airplane-favorite")).toHaveAttribute("aria-pressed", "true");
});

test("an airplane's card is still open after the account page and back", async ({ page }) => {
  // The owner's notice: "When I open an aircraft card and go to setup and come back, to aircraft tab, the card is not there
  // anymore". Aircraft was taken for the tab up tapped again, which puts its card away.
  await sky(page);
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  const card = page.getByTestId("airplane-profile");
  await expect(card.getByTestId("airplane-favorite")).toBeVisible({ timeout: slow(15_000) });
  // The card is the whole sheet, no title row over it (Apple Maps' card, 2026-11-10): the account page by its link.
  await page.goto("/app/plan?flight=a0b7d8&open=setup");
  await expect(sideDrawer(page).getByTestId("setup-page")).toBeVisible({ timeout: slow(15_000) });
  await sideDrawer(page).getByTestId("console-close").click();
  await expect(sideDrawer(page).getByTestId("setup-page")).toBeHidden();
  await expect(page).toHaveURL(/[?&]flight=a0b7d8/);
  await expect(card.getByTestId("airplane-favorite")).toBeVisible();
});

test("the card's sketch of where an airplane has flown is in its heights' colours, as the map's path, with the fields it left and is bound for", async ({
  page,
}) => {
  // The owner's ask: "Can the aircraft trace in the thumbnail have the
  // origin/destination airport? And the trace color green just like on
  // the map?"
  await sky(page);
  const fields: Record<string, { lat: number; lon: number; name: string }> = {
    TJSJ: { lat: 18.4394, lon: -66.0018, name: "Luis Munoz Marin International Airport" },
    KORD: { lat: 41.9786, lon: -87.9048, name: "Chicago O'Hare International Airport" },
  };
  await page.route(
    (url) => /\/api\/planner\/airport\/(TJSJ|KORD)$/.test(url.pathname),
    (route) => {
      const ident = route.request().url().split("/").pop()!;
      return route.fulfill({ json: { ident, ...fields[ident] } });
    },
  );
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  // A slide of the row across its card's top, after its flight now (the owner's word, 2026-11-26).
  const sketch = page.getByTestId("airplane-profile").getByTestId("airplane-pictures").getByTestId("trail-sketch");
  await expect(sketch).toBeVisible({ timeout: slow(15_000) });
  // The fields, each its dot and its ident.
  await expect(sketch.locator('[data-sketch-field="TJSJ"]')).toHaveText("TJSJ");
  await expect(sketch.locator('[data-sketch-field="KORD"]')).toHaveText("KORD");
  // Its trace in the colours of its heights (heightColour), 7,000 to
  // 12,000 ft here, not the tint it was.
  const colours = await sketch.locator("[data-sketch-run]").evaluateAll((runs) => runs.map((r) => r.getAttribute("stroke")));
  expect(colours.length).toBeGreaterThan(0);
  for (const colour of colours) expect(colour).toMatch(/^hsl\(\d+ 85% 45%\)$/);
});

test("an airplane's card is laid out as an airport's: its actions the same size, in one row under its head", async ({ page }) => {
  // The owner's ask: "Do airport and aircraft cards have same layouts?",
  // and their pick of the two cards' redesign (A2): the same row of actions.
  await sky(page, { ...DETAIL, description: "PIPER PA-28-140/150/160/180 CHEROKEE" });
  const tile = async (action: string) => {
    await grabberTo(page, "half");
    return Math.round((await page.getByTestId(action).first().boundingBox())!.height);
  };
  await page.goto("/app/plan?place=C81");
  await settle(page);
  await expect(page.getByTestId("fly-here")).toBeEnabled({ timeout: slow(15_000) });
  const airport = await tile("place-call");
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  await expect(page.getByTestId("airplane-alerts")).toBeVisible({ timeout: slow(15_000) });
  expect(await tile("airplane-alerts")).toEqual(airport);
  // What it is under its name, its call sign first while it flies.
  await expect(page.getByTestId("airplane-profile")).toContainText("UAL2088 · ");
});

test("an airplane's card in the air has Track, Alerts and Favorite in a row, Share and the close in its head, its flight's state and height in sight, and its airport a tap away", async ({
  page,
}) => {
  // The owner's design of 2026-11-26: in the air Track filled, Alerts,
  // Favorite and Figures, the four always (2026-11-27); no Fly This while it flies; Share at the head's start, ✕ at its end.
  await sky(page, { ...DETAIL, departed: { ident: "C81", name: "Campbell Airport", at: Date.now() / 1000 - 3600 } });
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  const card = page.getByTestId("airplane-profile");
  await expect(card.getByTestId("airplane-track")).toBeVisible({ timeout: slow(15_000) });
  await expect(card.getByTestId("fly-this-airplane")).toHaveCount(0);
  await settled(frontSheet(page)); // measured once it has slid up, not on its way
  const row = await Promise.all(
    ["airplane-track", "airplane-alerts", "airplane-favorite", "airplane-figures-open"].map(
      async (id) => (await card.getByTestId(id).boundingBox())!,
    ),
  );
  for (let i = 1; i < row.length; i++) {
    expect(Math.abs(row[i]!.y - row[0]!.y), "one row").toBeLessThan(1);
    expect(Math.abs(row[i]!.width - row[0]!.width), "equal").toBeLessThan(1);
    expect(row[i]!.x, "each beside the one before").toBeGreaterThan(row[i - 1]!.x + row[i - 1]!.width);
  }
  // Tracked as it opens from traffic, said on its action, its word the same either way.
  await expect(card.getByTestId("airplane-track")).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByTestId("airplane-track")).toContainText("Track");
  // Share at the left of its head, the close at the right, both over the actions.
  const box = (await card.boundingBox())!;
  const [share, close] = await Promise.all(
    ["airplane-share", "sheet-card-close"].map(async (id) => (await card.getByTestId(id).boundingBox())!),
  );
  expect(share!.x + share!.width, "Share at the left").toBeLessThan(box.x + box.width / 2);
  expect(close!.x, "the close at the right").toBeGreaterThan(box.x + box.width / 2);
  expect(share!.y + share!.height, "Share over the actions").toBeLessThanOrEqual(row[0]!.y);
  await expect(card.getByTestId("airplane-share")).toHaveAccessibleName("Share N14511");
  // Descending 1,200 ft a minute, at 7,000 ft and 250 kt: said in its flight's box.
  await expect(card.getByTestId("flight-state")).toHaveText("DES");
  await expect(card.getByTestId("flight-altitude")).toHaveText("7,000 ft ↓ 1,200 fpm · 250 kt · 090° true");
  // Its airport: the field it left, its card over the airplane's, and its
  // close back to the airplane's.
  const airport = card.getByTestId("flight-airport");
  await expect(airport).toContainText("C81");
  await airport.click();
  await expect(page).toHaveURL(/[?&]place=C81/);
  await expect(page.getByTestId("place-card")).toBeVisible({ timeout: slow(15_000) });
  await closeCard(page, "place-close");
  await expect(page).not.toHaveURL(/[?&]place=/);
  await expect(page).toHaveURL(/[?&]flight=a0b7d8/);
  await expect(page.getByTestId("airplane-profile")).toBeVisible();
});

test("an airplane not heard now has its last flight sketched, on the ground where it landed, and its Flights row opens its replay and debrief", async ({
  page,
}) => {
  // The owner's ask: "if it's not flying now, sketch the last flight."
  const off = Date.now() / 1000 - 30 * 3600;
  const lci = { ident: "LCI", name: "Laconia Municipal Airport", city: "Laconia", region: "US-NH" };
  const lwm = { ident: "LWM", name: "Lawrence Municipal Airport", city: "Lawrence", region: "US-MA" };
  const points = Array.from({ length: 80 }, (_, i) => ({
    t: off + i * 60,
    lat: 43.57 - i * 0.0107,
    lon: -71.42 + i * 0.0038,
    alt_ft: 800 + Math.min(i, 79 - i) * 120,
    gs_kt: 100,
    track_deg: 165,
    vrate_fpm: i < 40 ? 500 : -500,
  }));
  await sky(page, { hex: "a89c1e", registration: "N654FL", type: "P28A", departed: null, trail: [] });
  await page.route(
    (url) => /\/api\/planner\/traffic\/flight\/a89c1e\/history$/.test(url.pathname),
    (route) =>
      route.fulfill({
        json: {
          hex: "a89c1e",
          registration: "N654FL",
          type: "P28A",
          flights: [
            { id: Math.floor(off), origin: lci, destination: lwm, off, on: off + 79 * 60, landed: true, in_air: false, max_alt_ft: 5520 },
          ],
        },
      }),
  );
  await page.route(
    (url) => /\/api\/planner\/traffic\/flight\/a89c1e\/history\/\d+$/.test(url.pathname),
    (route) => route.fulfill({ json: { id: Math.floor(off), points } }),
  );
  await page.goto("/app/plan?flight=a89c1e");
  await settle(page);
  // One card for it, its N-number's (the owner's design, 2026-11-26): on the
  // ground the first slide under its actions one line, where it landed.
  const card = page.getByTestId("airplane-profile");
  await expect(card.getByTestId("airplane-status")).toHaveText(/^On the ground landed LWM /, { timeout: slow(15_000) });
  await expect(card.getByTestId("airplane-track")).toHaveCount(0);
  // No photo of it on Planespotters: its last flight sketched in the row after its status.
  await expect(card.getByTestId("flight-photo-open")).toHaveCount(0);
  await expect(card.getByTestId("airplane-photo-open")).toHaveCount(0);
  await expect(card.getByTestId("airplane-pictures").getByTestId("trail-sketch")).toBeAttached();
  // Debrief is in its flights, on the card's one page: each row its replay and debrief.
  await card.getByTestId("past-flight").first().click();
  await expect(page).toHaveURL(new RegExp(`[?&]past=${Math.floor(off)}`));
  await expect(page.getByTestId("past-flight-card").getByTestId("past-flight-name")).toHaveText("LCI → LWM");
});
