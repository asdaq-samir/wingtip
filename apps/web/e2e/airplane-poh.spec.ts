import { test, expect, type Page } from "@playwright/test";
import { inSheet, settle, slow } from "./helpers";
import { FAA } from "./faaRecord";
import { tinyPdf } from "./tinyPdf";

/**
 * An airplane's POH on its card (features/documents' PohRow): the app
 * ships none (the manufacturers' are copyrighted), so Figures offers Add
 * Your POH, which takes a PDF from the device into Your Documents and
 * links it to the N-number; the row then opens it in the reader, and its
 * menu unlinks it, the document kept. The registry is stubbed.
 */

const PIPER = {
  ...FAA,
  n_number: "N654FL",
  mode_s_hex: "A89C1E",
  manufacturer: "Piper",
  model: "PA-28-140",
  make_short: "Piper",
  model_short: "PA-28",
  year: 1971,
};

async function stubbed(page: Page) {
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic/registered"),
    (route) => route.fulfill({ json: new URL(route.request().url()).searchParams.get("q") === "N654FL" ? PIPER : null }),
  );
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic/find"),
    (route) => route.fulfill({ json: { aircraft: [], checked: true, source: "adsb.lol", license: "ODbL 1.0" } }),
  );
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic"),
    (route) => route.fulfill({ json: { aircraft: [], age_s: 1, source: "adsb.lol", license: "ODbL 1.0" } }),
  );
  await page.route(
    (url) => url.hostname === "api.planespotters.net",
    (route) => route.fulfill({ json: { photos: [] } }),
  );
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("an airplane's POH is added from the device, opens in the reader, and is unlinked", async ({ page }) => {
  await stubbed(page);
  await page.goto("/app/plan?airplane=N654FL");
  await settle(page);
  // Its POH on its Figures, the fourth button's card (the owner, 2026-11-26).
  await page.getByTestId("airplane-profile").getByTestId("airplane-figures-open").click();
  const card = page.getByTestId("airplane-figures");
  await expect(card.getByTestId("airplane-poh-add")).toBeVisible({ timeout: slow(15_000) });
  // The model's choice offered by the registry's make and model, off.
  await expect(card.getByTestId("airplane-poh-all")).toHaveAttribute("aria-checked", "false");
  await expect(card.getByText("Use for All Piper PA-28-140")).toBeVisible();

  // A PDF from the device's files, never sent anywhere.
  const uploads: string[] = [];
  page.on("request", (r) => r.postDataBuffer()?.includes("%PDF") && uploads.push(r.url()));
  await card
    .locator('input[type="file"][accept*="pdf"]')
    .setInputFiles({ name: "PA-28-140 POH.pdf", mimeType: "application/pdf", buffer: tinyPdf("Normal Procedures") });
  const row = card.getByTestId("airplane-poh");
  await expect(row).toContainText("PA-28-140 POH");
  expect(uploads, "a pilot's own document is never sent").toEqual([]);

  // It opens in the reader, its page drawn, and closes back to the card: the card pulled up to
  // it first, as a finger would, since at half a card's body does not scroll (index.css, the one
  // scrolling rule) and the row came under its edge (PR #591's run: "outside of the viewport").
  await inSheet(page, row);
  await row.click();
  const reader = page.getByTestId("document-reader");
  await expect(reader.getByTestId("document-pdf").locator(".page canvas, .page .canvasWrapper")).not.toHaveCount(0);
  await reader.getByTestId("document-reader-close").click();
  await expect(reader).toHaveCount(0);

  // Unlinked from its menu: Add Your POH again.
  await card.getByRole("button", { name: "More for POH" }).click();
  await page.getByTestId("airplane-poh-unlink").click();
  await expect(card.getByTestId("airplane-poh-add")).toBeVisible();
  await expect(card.getByTestId("airplane-poh")).toHaveCount(0);
});
