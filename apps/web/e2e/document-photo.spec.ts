import { readFileSync } from "node:fs";
import { test, expect, type Route } from "@playwright/test";
import { library, openConsole, showTabs } from "./helpers";

/**
 * "Add from a Photo" in the Logbook: a paper logbook page photographed,
 * read (the assistant's POST /api/read-document, mocked with what it
 * answers for the shared fixture's page) and checked; nothing is logged
 * until a flight is ticked and Log is pressed, and then only the ticked
 * flight, as a typed one is posted.
 */

const ANSWERS = JSON.parse(readFileSync(new URL("../src/lib/fixtures/documentAnswers.json", import.meta.url), "utf8"));
const A_PILOT = { id: 1, email: "pilot@example.com", displayName: "A Pilot", developer: false };
// A photo is a photo: one white pixel, as a PNG.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC", "base64");

test("a logbook page's flights are logged only once ticked, each as the engine read it", async ({ page }) => {
  await page.route("**/api/me", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(A_PILOT) }));
  const asked: { kind: string; media_type: string }[] = [];
  await page.route(url => url.pathname.endsWith("/api/read-document"), async (route: Route) => {
    asked.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ANSWERS.logbook) });
  });
  const posted: { flownOn: string; route: string }[] = [];
  await page.route("**/api/logbook", async (route: Route) => {
    if (route.request().method() === "POST") {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: posted.length, ...posted.at(-1) }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
  });

  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const console = page.getByTestId("console-sheet");
  await library(console, "Logbook");

  await console.getByTestId("logbook-photo").click();
  const sheet = page.getByTestId("logbook-photo-sheet");
  await sheet.getByTestId("logbook-photo-sheet-file").setInputFiles({ name: "page.png", mimeType: "image/png", buffer: PIXEL });
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toMatchObject({ kind: "logbook-page", media_type: "image/jpeg" });

  // Read, checked, and nothing logged: Log waits for a tick.
  await expect(sheet.getByTestId("keep-row-2")).toBeVisible();
  await expect(sheet.getByTestId("logbook-photo-log")).toBeDisabled();
  expect(posted).toHaveLength(0);

  await sheet.getByTestId("keep-row-2").click();
  await sheet.getByTestId("logbook-photo-log").click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0]).toMatchObject({ flownOn: "2026-10-10", route: "KANE KFCM KANE", approaches: 2, holding: true });
});
