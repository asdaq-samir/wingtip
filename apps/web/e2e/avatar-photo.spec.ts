import { test, expect, type Page } from "@playwright/test";
import { openConsole, settle } from "./helpers";

/**
 * The pilot's photo for their avatar (the owner, 2026-11-20: "Yes to
 * choose photo"): Pilot Details' Choose Photo opens the system's picker,
 * the photo goes to the gateway cropped square and scaled down as a JPEG,
 * and every avatar shows it -- You's head, Pilot Details' and the account
 * button -- until Remove Photo brings the initials back. The gateway's
 * photo calls are answered here, its own rules being AvatarTest's, so
 * the shared developer account's own photo is never touched.
 */

/** A 4-by-2 red PNG: something a browser can read and crop. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAEElEQVR4nGM4IScHRwzIHABvCgghBqXSdgAAAABJRU5ErkJggg==", "base64");

/** The gateway's photo calls, kept in the test: what was sent and the
 *  avatarUrl GET /api/me gives from it. */
async function stubPhotos(page: Page, refuse = false) {
  const sent: { method: string; body: Buffer | null }[] = [];
  let url: string | null = null;
  await page.route(
    (u) => u.pathname === "/api/me",
    async (route) => {
      const me = (await (await route.fetch()).json()) as Record<string, unknown>;
      await route.fulfill({ json: { ...me, avatarUrl: url } });
    },
  );
  await page.route(
    (u) => u.pathname === "/api/me/avatar",
    async (route) => {
      const request = route.request();
      if (request.method() === "GET") return route.fulfill({ contentType: "image/png", body: PNG });
      sent.push({ method: request.method(), body: request.postDataBuffer() });
      if (refuse) {
        return route.fulfill({ status: 415, json: { status: 415, detail: "A photo is a JPEG, PNG or WebP image." } });
      }
      url = request.method() === "PUT" ? `/api/me/avatar?v=${sent.length}` : null;
      return route.fulfill({ status: 204 });
    },
  );
  return sent;
}

async function pilotDetails(page: Page) {
  await page.goto("/app/plan");
  await settle(page);
  await openConsole(page);
  await page.getByTestId("console-sheet").getByTestId("pilot-row").click();
  return page.getByTestId("pilot-photo");
}

test("a photo chosen in Pilot Details is every avatar's, and Remove Photo brings the initials back", async ({ page }) => {
  const sent = await stubPhotos(page);
  const photo = await pilotDetails(page);
  await expect(photo.getByTestId("avatar-photo")).toHaveCount(0);
  await expect(photo.getByTestId("remove-photo")).toHaveCount(0);

  // Choose Photo opens the system's picker (Photos on an iPhone).
  const chooser = page.waitForEvent("filechooser");
  await photo.getByTestId("choose-photo").click();
  await (await chooser).setFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });

  // Sent as the form's photo, a JPEG made here from the PNG.
  await expect.poll(() => sent.length).toBe(1);
  const body = sent[0]!.body!.toString("latin1");
  expect(sent[0]!.method).toBe("PUT");
  expect(body).toContain('name="photo"');
  expect(body).toContain("Content-Type: image/jpeg");
  expect(body).toContain("\xFF\xD8\xFF");

  // Every avatar shows it: Pilot Details', and the account button's.
  await expect(photo.getByTestId("avatar-photo")).toHaveAttribute("src", "/api/me/avatar?v=1");
  await expect(page.getByTestId("account-button").getByTestId("avatar-photo")).toHaveAttribute("src", "/api/me/avatar?v=1");

  await photo.getByTestId("remove-photo").click();
  await expect.poll(() => sent.at(-1)?.method).toBe("DELETE");
  await expect(photo.getByTestId("avatar-photo")).toHaveCount(0);
  await expect(photo.getByTestId("remove-photo")).toHaveCount(0);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("a photo the gateway refuses is said under the buttons, and the initials stay", async ({ page }) => {
  await stubPhotos(page, true);
  const photo = await pilotDetails(page);
  const chooser = page.waitForEvent("filechooser");
  await photo.getByTestId("choose-photo").click();
  await (await chooser).setFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(photo.getByText("A photo is a JPEG, PNG or WebP image.")).toBeVisible();
  await expect(photo.getByTestId("avatar-photo")).toHaveCount(0);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
