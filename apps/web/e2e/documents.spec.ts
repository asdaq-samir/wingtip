import { test, expect, type Page } from "@playwright/test";
import { consoleSheet, noTips, openConsole, showTabs } from "./helpers";

/**
 * The documents library and its reader (features/documents, decision
 * 0056): You's Documents row lists the FAA's shelf with each edition and
 * the pilot's own PDFs; a CFR part opens at the section a link names, is
 * searched, bookmarked and closed back; a PDF added from the device opens
 * in pdf.js and comes back after a reload, on this device alone. The
 * shelf and its text are stubbed: the FAA's and the eCFR's publications
 * are not the suite's to depend on (the CI stack fetches none,
 * FAA_LIBRARY_REFRESH=0).
 */

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

const SHELF = {
  documents: [
    { id: "cfr-14-91", title: "14 CFR Part 91: General Operating and Flight Rules", group: "Regulations", kind: "text", edition: "2026-11-10", label: "eCFR", date: "2026-11-10", bytes: 900 },
    { id: "aim", title: "Aeronautical Information Manual", group: "AIM", kind: "pdf", edition: null, label: null, date: null, bytes: null },
  ],
};

const PART_91 = {
  head: "PART 91 - GENERAL OPERATING AND FLIGHT RULES",
  groups: [
    {
      head: "Subpart B - Flight Rules",
      sections: [
        { id: "91.151", head: "§ 91.151 Fuel requirements for flight in VFR conditions.", paragraphs: ["(a) No person may begin a flight in an airplane under VFR conditions unless ..."] },
        ...Array.from({ length: 6 }, (_, i) => ({ id: `91.15${2 + i}`, head: `§ 91.15${2 + i} Reserved.`, paragraphs: ["(a) ".padEnd(900, "words ")] })),
        { id: "91.159", head: "§ 91.159 VFR cruising altitude or flight level.", paragraphs: ["(a) When operating below 18,000 feet MSL and ..."] },
      ],
    },
  ],
};

/** A one-page PDF, its cross-reference table's offsets counted. */
function tinyPdf(words: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${words.length + 31} >>\nstream\nBT /F1 24 Tf 72 700 Td (${words}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((o, i) => {
    const at = body.length;
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

async function stubLibrary(page: Page) {
  await page.route(
    (url) => url.pathname === "/api/planner/library",
    (route) => route.fulfill({ json: SHELF }),
  );
  await page.route(
    (url) => url.pathname === "/api/planner/library/cfr-14-91/2026-11-10/text",
    (route) => route.fulfill({ json: PART_91 }),
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(noTips);
  await stubLibrary(page);
});

test("a cited section opens the reader at it, a search finds its words, a bookmark is kept, and the close goes back", async ({ page }) => {
  await page.goto("/app/plan?doc=cfr-14-91%4091.159");
  const reader = page.getByTestId("document-reader");
  await expect(reader).toBeVisible();
  await expect(reader.getByRole("heading", { name: "14 CFR Part 91: General Operating and Flight Rules" })).toBeVisible();
  // At the section the link names, its heading at the top of the text.
  const heading = reader.getByRole("heading", { name: "§ 91.159 VFR cruising altitude or flight level." });
  await expect(heading).toBeInViewport();

  // A search lists where it is found; a tap goes there.
  await reader.getByTestId("document-search").fill("fuel requirements");
  await reader.getByTestId("document-search").press("Enter");
  const hits = reader.getByTestId("document-text-hits");
  await expect(hits).toContainText("1 Found");
  await hits.getByRole("button", { name: /§ 91\.151/ }).click();
  await expect(reader.getByRole("heading", { name: /§ 91\.151 Fuel requirements/ })).toBeInViewport();

  // The section bookmarked, and listed in the contents by its heading.
  await reader.getByTestId("document-bookmark-button").click();
  await expect(reader.getByTestId("document-bookmark-button")).toHaveAttribute("aria-pressed", "true");
  await reader.getByTestId("document-contents-button").click();
  await reader.getByTestId("document-contents-half").getByText("Bookmarks").click();
  await expect(reader.getByTestId("document-bookmark")).toHaveCount(1);

  await reader.getByTestId("document-reader-close").click();
  await expect(reader).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]doc=/);
});

test("You's Documents lists the shelf with its editions, and a PDF added stays on this device", async ({ page }) => {
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const sheet = consoleSheet(page);
  await sheet.getByTestId("documents-row").click();
  const library = sheet.getByTestId("documents-page");
  await expect(library.getByTestId("document-cfr-14-91")).toContainText("eCFR · 10 Nov 2026");
  // The AIM not had yet: said, and not offered to keep.
  await expect(library.getByTestId("document-aim")).toContainText("Not in the library yet");
  await expect(library.getByTestId("document-aim").getByTestId("document-keep")).toBeDisabled();

  // A PDF from the device's files, added to Your Documents.
  const uploads: string[] = [];
  page.on("request", (r) => r.postDataBuffer()?.includes("%PDF") && uploads.push(r.url()));
  await library.locator('input[type="file"]').setInputFiles({ name: "C172S POH.pdf", mimeType: "application/pdf", buffer: tinyPdf("Normal Procedures") });
  const own = library.getByTestId("document-own");
  await expect(own).toContainText("C172S POH");
  expect(uploads, "a pilot's own document is never sent").toEqual([]);

  // It opens in pdf.js, its page drawn.
  await own.click();
  const reader = page.getByTestId("document-reader");
  await expect(reader.getByTestId("document-pdf").locator(".page canvas, .page .canvasWrapper")).not.toHaveCount(0);
  await reader.getByTestId("document-reader-close").click();

  // Still there after a reload: IndexedDB, not the page's memory.
  await page.reload();
  await showTabs(page);
  await openConsole(page);
  await consoleSheet(page).getByTestId("documents-row").click();
  await expect(consoleSheet(page).getByTestId("document-own")).toContainText("C172S POH");
});
