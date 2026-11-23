import { test, expect } from "@playwright/test";
import { openConsole, settle } from "./helpers";

/**
 * You's Connected Apps (the deep security review of 2026-11-21, N2): the
 * AI apps connected through the connector are listed, and one is ended
 * from Wingtip's side after the pilot says so. The gateway's calls are
 * answered here, its own rules being ConnectionsTest's, so the shared
 * developer account's connections are never touched.
 */
test("a connected app is listed and disconnected after asking", async ({ page }) => {
  let connections = [
    {
      id: "a1",
      app: "Claude",
      scopes: "wingtip:read wingtip:flights",
      can: ["Read your airplanes and saved flights, and plan with them", "Save, change and delete your saved flights"],
      renewedAt: "2026-11-20T15:00:00Z",
      until: null,
    },
    {
      id: "b2",
      app: "ChatGPT",
      scopes: "wingtip:read",
      can: ["Read your airplanes and saved flights, and plan with them"],
      renewedAt: null,
      until: null,
    },
  ];
  const ended: string[] = [];
  await page.route(
    (u) => u.pathname.startsWith("/api/me/connections"),
    async (route) => {
      const request = route.request();
      if (request.method() === "GET") return route.fulfill({ json: connections });
      const id = new URL(request.url()).pathname.split("/").pop()!;
      ended.push(id);
      connections = connections.filter((c) => c.id !== id);
      return route.fulfill({ status: 204 });
    },
  );
  await page.goto("/app/plan");
  await settle(page);
  await openConsole(page);
  await page.getByTestId("console-sheet").getByTestId("connected-apps-row").click();
  const list = page.getByTestId("connected-apps");
  await expect(list.getByText("Claude")).toBeVisible();
  await expect(list.getByText("ChatGPT")).toBeVisible();
  // What each may do, in the consent page's words: only Claude may write.
  await expect(list.getByTestId("connected-app").first()).toContainText("Save, change and delete your saved flights");
  await expect(list.getByTestId("connected-app").nth(1)).not.toContainText("Save, change");

  await list.getByTestId("disconnect-app").first().click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("Disconnect Claude?");
  await ask.getByRole("button", { name: "Disconnect" }).click();

  await expect.poll(() => ended).toEqual(["a1"]);
  await expect(list.getByText("Claude")).toHaveCount(0);
  await expect(list.getByText("ChatGPT")).toBeVisible();
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
