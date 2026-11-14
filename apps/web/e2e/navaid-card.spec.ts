import { test, expect } from "@playwright/test";
import { slow } from "./helpers";

// The Northbrook VOR/DME as the suite's overlay tiles have it
// (e2e/fixtures/overlay-tiles), from the owner's iPhone screenshot of its
// card, 2026-11-14.
const OBK = "OBK@42.2214,-87.9517";

// Every card reached by a link (the owner's rule): OBK's link opens its
// card, whose head is every card's, whose actions are a full row, whose
// service volume is AIM 1-1-8's TBL 1-1-1, and whose Share sends that link.
test("a VOR's link opens its card, with its full row and every band of its service volume", async ({ page }) => {
  await page.goto(`/app/plan?navaid=${encodeURIComponent(OBK)}`);
  const head = page.locator("[data-sheet-head]").filter({ visible: true }).last();
  await expect(head.getByRole("heading")).toHaveText("OBKVOR/DME", { timeout: slow(20000) });
  // Its line, its frequency as the dial shows it; Share at the start.
  await expect(head).toContainText("Northbrook · 113.0");
  await expect(head.locator("[data-slot=head-start]").getByTestId("card-share")).toBeVisible();
  // Direct To, Add to Route and the frequency, each there with no route,
  // the first two greyed until there is one.
  const row = page.getByTestId("point-actions").filter({ visible: true });
  await expect(row.getByTestId("point-direct-to")).toBeDisabled();
  await expect(row.getByTestId("point-add")).toBeDisabled();
  await expect(row.getByTestId("point-copy")).toHaveText("113.0");
  // VOR High's bands, the 130 nm from 18,000 to 45,000 ft among them.
  await expect(page.getByTestId("vor-service-volume").filter({ visible: true })).toContainText(
    "VOR High · 40 nm under 5,000 ft above it, 70 nm to 14,500, 100 nm to 18,000, 130 nm to 45,000, 100 nm to 60,000",
  );
  // Shared where the browser can: what it would send.
  await page.evaluate(() => {
    (window as unknown as { sent: unknown[] }).sent = [];
    navigator.share = (data?: ShareData) => {
      (window as unknown as { sent: unknown[] }).sent.push(data);
      return Promise.resolve();
    };
  });
  await head.getByTestId("card-share").click();
  const sent = await page.evaluate(() => (window as unknown as { sent: { url: string }[] }).sent);
  expect(new URL(sent[0]!.url).searchParams.get("navaid")).toBe(OBK);
  // Its ✕ takes the link's key off.
  await page.getByTestId("sheet-card-close").filter({ visible: true }).click();
  expect(new URL(page.url()).searchParams.get("navaid")).toBeNull();
});
