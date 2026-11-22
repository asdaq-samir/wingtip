import { test, expect, type Locator, type Page } from "@playwright/test";
import { noTips } from "./helpers";
import { tinyPdf } from "./tinyPdf";

/**
 * The reader's markup and notes (features/documents, web.md 13a "Markup
 * and notes"): words highlighted with a note, a stroke drawn, undone and
 * erased, two fingers scrolling with the pen in hand, the bar where the
 * layout puts tools, the notes listed and opening their page, a page
 * shared with its marks, and the marks and the open document back after a
 * reload from this device alone,
 * none of it ever sent. On the phone's project and the iPad's
 * (webkit-ipad, Safari's engine with touch), the iPad being the device
 * pilots mark up on. The shelf and its PDF are stubbed, as in
 * documents.spec.
 */

const EDITION = "FAA-H-8083-25C";
const SHELF = {
  documents: [
    {
      id: "phak",
      title: "Pilot's Handbook of Aeronautical Knowledge",
      group: "Handbooks",
      kind: "pdf",
      edition: EDITION,
      label: EDITION,
      date: "2026-11-03",
      bytes: 700,
    },
  ],
};
const NOTE = "Read before engine start";

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(noTips);
  // The page saved as a download, not offered to a share sheet the
  // browser under test may or may not have.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "canShare", { value: undefined, configurable: true }));
  await page.route(
    (url) => url.pathname === "/api/planner/library",
    (route) => route.fulfill({ json: SHELF }),
  );
  await page.route(
    (url) => url.pathname === `/api/planner/library/phak/${EDITION}.pdf`,
    (route) => route.fulfill({ body: tinyPdf("Normal Procedures Checklist"), contentType: "application/pdf" }),
  );
});

/** The marks kept on the device for the handbook's edition, read from IndexedDB itself. */
const keptMarks = (page: Page) =>
  page.evaluate(
    (key) =>
      new Promise<{ kind: string; text?: string; note?: string }[]>((done) => {
        const open = indexedDB.open("wingtip-documents");
        open.onsuccess = () => {
          const get = open.result.transaction("files").objectStore("files").get(key);
          get.onsuccess = () => done((get.result ?? []) as { kind: string; text?: string; note?: string }[]);
        };
      }),
    `marks/phak@${EDITION}`,
  );

/** A stroke across the page's lower half, by a mouse's pointer events. */
async function stroke(page: Page, sheet: Locator, from: [number, number], to: [number, number]) {
  const box = (await sheet.boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 12 });
  await page.mouse.up();
}

/** Two fingers down on the pages and swiped up 120 px together, as
 *  touch pointer events (Playwright's touchscreen has one finger): how far
 *  the pages scrolled, and whether they could. */
const twoFingerSwipe = (pdf: Locator) =>
  pdf.evaluate(async (box) => {
    const r = box.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height * 0.6;
    const before = box.scrollTop;
    const send = (type: string, id: number, px: number, py: number) =>
      (document.elementFromPoint(px, py) ?? box).dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          pointerType: "touch",
          isPrimary: id === 11,
          clientX: px,
          clientY: py,
          bubbles: true,
          cancelable: true,
        }),
      );
    send("pointerdown", 11, x - 40, y);
    send("pointerdown", 12, x + 40, y);
    for (let step = 1; step <= 6; step++) {
      send("pointermove", 11, x - 40, y - step * 20);
      send("pointermove", 12, x + 40, y - step * 20);
    }
    send("pointerup", 11, x - 40, y - 120);
    send("pointerup", 12, x + 40, y - 120);
    await new Promise((done) => setTimeout(done, 100));
    return { scrollable: box.scrollHeight > box.clientHeight + 1, by: box.scrollTop - before };
  });

test("@smoke a passage highlighted with a note, a stroke drawn, undone and erased, the notes listed, the page shared, and the marks back after a reload from this device alone", async ({
  page,
}) => {
  const sent: string[] = [];
  page.on("request", (r) => {
    const body = r.postData();
    if (body) sent.push(body);
  });
  await page.goto("/app/plan?doc=phak");
  const reader = page.getByTestId("document-reader");
  const pdf = reader.getByTestId("document-pdf");
  const words = pdf.locator(".textLayer span", { hasText: "Normal Procedures" });
  await expect(words).toBeVisible();

  // Markup's bar, the highlighter in hand; words picked are highlighted.
  await reader.getByTestId("document-markup").click();
  const bar = reader.getByTestId("document-markup-bar");
  await expect(bar).toBeVisible();
  await expect(bar.getByTestId("document-tool-highlight")).toHaveAttribute("aria-pressed", "true");
  // Where the iPad's layout puts tools: from the regular width (660) under
  // the reader's head, above the pages; on a phone at the pages' foot.
  const regular = (page.viewportSize()?.width ?? 0) >= 660;
  await expect(bar).toHaveAttribute("data-at", regular ? "head" : "foot");
  const [barBox, pagesBox] = [(await bar.boundingBox())!, (await pdf.boundingBox())!];
  if (regular) expect(barBox.y + barBox.height).toBeLessThanOrEqual(pagesBox.y + 1);
  else expect(barBox.y).toBeGreaterThan(pagesBox.y + pagesBox.height / 2);
  await words.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  const highlight = pdf.locator(".highlightEditor");
  await expect(highlight).toHaveCount(1);

  // Picked, it takes a note, its words over it.
  await highlight.click();
  await bar.getByTestId("document-note-button").click();
  const note = page.getByTestId("document-note");
  await expect(note).toContainText("Normal Procedures Checklist");
  await note.getByTestId("document-note-text").fill(NOTE);
  await note.getByTestId("document-note-done").click();
  await expect(note).toHaveCount(0);

  // The pen: a stroke drawn, Undo takes it back; drawn again, the eraser takes it.
  const sheet = pdf.locator(".page").first();
  const ink = pdf.locator(".inkEditor");
  await bar.getByTestId("document-tool-pen").click();
  await stroke(page, sheet, [0.2, 0.6], [0.7, 0.7]);
  await expect(ink).toHaveCount(1);
  await bar.getByTestId("document-undo-mark").click();
  await expect(ink).toHaveCount(0);
  await stroke(page, sheet, [0.2, 0.6], [0.7, 0.7]);
  await expect(ink).toHaveCount(1);
  await bar.getByTestId("document-tool-eraser").click();
  await stroke(page, sheet, [0.45, 0.5], [0.45, 0.8]);
  await expect(ink).toHaveCount(0);

  // Two fingers with the pen in hand scroll the pages and draw nothing.
  await bar.getByTestId("document-tool-pen").click();
  const scrolled = await twoFingerSwipe(pdf);
  if (scrolled.scrollable) expect(scrolled.by).toBeGreaterThan(0);
  await expect(ink).toHaveCount(0);

  // The page shared as a picture with its marks drawn in.
  const download = page.waitForEvent("download");
  await bar.getByTestId("document-share-marked").click();
  // WebKit writes a download's spaces as underscores.
  expect((await download).suggestedFilename().replaceAll("_", " ")).toBe("Pilot's Handbook of Aeronautical Knowledge p1 marked.png");

  // The notes, listed, each opening its page.
  await reader.getByTestId("document-contents-button").click();
  await reader.getByTestId("document-contents-half").getByText("Notes").click();
  const row = reader.getByTestId("document-note-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(NOTE);
  await expect(row).toContainText("Page 1");
  await row.click();
  await expect(reader.getByTestId("document-contents")).toHaveCount(0);

  // Kept on the device with its words and note, and back after a reload,
  // which keeps the document open (freshLoad keeps the address's doc).
  await expect
    .poll(() => keptMarks(page))
    .toEqual([expect.objectContaining({ kind: "highlight", text: "Normal Procedures Checklist", note: NOTE })]);
  await page.reload();
  await expect(page).toHaveURL(/[?&]doc=phak(&|$)/);
  await expect(pdf.locator(".highlightEditor")).toHaveCount(1);
  await reader.getByTestId("document-contents-button").click();
  await reader.getByTestId("document-contents-half").getByText("Notes").click();
  await expect(reader.getByTestId("document-note-row")).toContainText(NOTE);

  expect(
    sent.filter((b) => b.includes(NOTE) || b.includes("Normal Procedures")),
    "markup and notes never leave the device",
  ).toEqual([]);
});
