import { test, expect } from "@playwright/test";
import { closeCard, frontSheet, grabberTo, inSheet, settle, settled, showSearch, sideDrawer, slow } from "./helpers";
import { DETAIL, sky } from "./trackingSky";

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("an airplane opened is in the Aircraft card's Recents, and one starred on its card is in its Favorites, as airports are", async ({
  page,
}) => {
  await sky(page);
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  const card = page.getByTestId("flight-card");
  await expect(page.getByTestId("flight-name")).toHaveText("UAL2088", { timeout: slow(15_000) });
  const star = card.getByTestId("flight-favorite");
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await closeCard(page, "flight-close");
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
  await expect(page.getByTestId("flight-card").getByTestId("flight-favorite")).toHaveAttribute("aria-pressed", "true");
});

test("an airplane's card is still open after the account page and back", async ({ page }) => {
  // The owner's notice: "When I open an aircraft card and go to setup and come back, to aircraft tab, the card is not there
  // anymore". Aircraft was taken for the tab up tapped again, which puts its card away.
  await sky(page);
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  const card = page.getByTestId("flight-card");
  await expect(card.getByTestId("flight-favorite")).toBeVisible({ timeout: slow(15_000) });
  // The card is the whole sheet, no title row over it (Apple Maps' card, 2026-11-10): the account page by its link.
  await page.goto("/app/plan?flight=a0b7d8&open=setup");
  await expect(sideDrawer(page).getByTestId("setup-page")).toBeVisible({ timeout: slow(15_000) });
  await sideDrawer(page).getByTestId("console-close").click();
  await expect(sideDrawer(page).getByTestId("setup-page")).toBeHidden();
  await expect(page).toHaveURL(/[?&]flight=a0b7d8/);
  await expect(card.getByTestId("flight-favorite")).toBeVisible();
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
  const sketch = page.getByTestId("flight-card").getByTestId("trail-sketch");
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

test("an airplane's card is laid out as an airport's: its pictures across the top and four actions under them, at the same places", async ({
  page,
}) => {
  // The owner's ask: "Do airport and aircraft cards have same layouts?",
  // and their pick of the two cards' redesign (A2): the same head, the
  // same row of actions.
  await sky(page, { ...DETAIL, description: "PIPER PA-28-140/150/160/180 CHEROKEE" });
  const panel = sideDrawer(page);
  // Where the actions are from the pictures' top, half way.
  const places = async (head: string, action: string) => {
    await grabberTo(page, "half");
    const [top, tile, sheet] = await Promise.all(
      [page.getByTestId(head), page.getByTestId(action).first(), panel].map(async (l) => (await l.boundingBox())!),
    );
    return {
      head: Math.round(top.y - sheet.y),
      height: Math.round(top.height),
      actions: Math.round(tile.y - top.y),
      size: Math.round(tile.height),
    };
  };
  await page.goto("/app/plan?place=C81");
  await settle(page);
  await expect(page.getByTestId("fly-here")).toBeEnabled({ timeout: slow(15_000) });
  const airport = await places("place-head", "place-call");
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  await expect(page.getByTestId("flight-alert")).toBeVisible({ timeout: slow(15_000) });
  const airplane = await places("flight-head", "flight-alert");
  expect(airplane).toEqual(airport);
  // The long model whole in its two lines over the pictures' foot.
  const what = page.getByTestId("flight-what");
  await expect(what).toContainText("Cherokee");
  const [line, head] = await Promise.all([what, page.getByTestId("flight-head")].map(async (l) => (await l.boundingBox())!));
  expect(line.y + line.height).toBeLessThanOrEqual(head.y + head.height);
});

test("an airplane's card has Follow, Alert, Debrief and Favorite in a row, Share and the close alone in its head, its flight's state and height in its summary, and its airport a tap away", async ({
  page,
}) => {
  // The owner's pick of the redesign (A2): the actions a row under the
  // pictures, Follow filled, as Maps' are under a place's -- four since the
  // star became a tile, the head holding Share and the close alone
  // (2026-11-11), as the airport card's.
  await sky(page, { ...DETAIL, departed: { ident: "C81", name: "Campbell Airport", at: Date.now() / 1000 - 3600 } });
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  const card = page.getByTestId("flight-card");
  await expect(card.getByTestId("flight-follow")).toBeVisible({ timeout: slow(15_000) });
  await settled(frontSheet(page)); // measured once it has slid up, not on its way
  const row = await Promise.all(
    ["flight-follow", "flight-alert", "flight-debrief", "flight-favorite"].map(async (id) => (await card.getByTestId(id).boundingBox())!),
  );
  for (let i = 1; i < row.length; i++) {
    expect(Math.abs(row[i]!.y - row[0]!.y), "one row").toBeLessThan(1);
    expect(Math.abs(row[i]!.width - row[0]!.width), "equal").toBeLessThan(1);
    expect(row[i]!.x, "each beside the one before").toBeGreaterThan(row[i - 1]!.x + row[i - 1]!.width);
  }
  // Following it as it opens, said on its action.
  await expect(card.getByTestId("flight-follow")).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByTestId("flight-follow")).toContainText("Following");
  // Share and the close alone in the head, the bar's out of the pill: Share
  // at the left, the close at the right, the star a tile (2026-11-11).
  const head = (await card.getByTestId("flight-head").boundingBox())!;
  const [share, close] = await Promise.all(
    ["flight-share", "flight-close"].map(async (id) => {
      const button = (await card.getByTestId(id).boundingBox())!;
      expect(button.y >= head.y && button.y + button.height <= head.y + head.height, `${id} on the pictures`).toBe(true);
      return button;
    }),
  );
  expect(share!.x + share!.width, "Share at the left").toBeLessThan(head.x + head.width / 2);
  expect(close!.x, "the close at the right").toBeGreaterThan(head.x + head.width / 2);
  await expect(card.getByTestId("flight-share")).toHaveAccessibleName("Share UAL2088");
  // Descending 1,200 ft a minute, at 7,000 ft and 250 kt: said in its summary.
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
  await expect(page.getByTestId("flight-card")).toBeVisible();
});

test("an airplane not heard now has its last flight sketched, on the ground where it landed, and Debrief opens it", async ({ page }) => {
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
  const card = page.getByTestId("flight-card");
  await expect(card.getByTestId("flight-chip")).toHaveText(/^Landed LWM \d{1,2} [A-Z][a-z]{2}$/, { timeout: slow(15_000) });
  await expect(card.getByTestId("flight-state")).toHaveText("GND");
  // No photo of it on Planespotters: its last flight sketched, the one
  // picture of its strip.
  await expect(card.getByTestId("flight-photo-open")).toHaveCount(0);
  await expect(card.getByTestId("trail-sketch")).toBeAttached();
  // Its airport: where it landed.
  await expect(card.getByTestId("flight-airport")).toContainText("LWM");
  await card.getByTestId("flight-debrief").click();
  await expect(page).toHaveURL(new RegExp(`[?&]past=${Math.floor(off)}`));
  await expect(page.getByTestId("past-flight-card").getByTestId("past-flight-name")).toHaveText("LCI → LWM");
});
