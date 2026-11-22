import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

type Fixture = { flight: Record<string, unknown>; view: { approaches: Record<string, unknown>[] } & Record<string, unknown> };
const fixture = JSON.parse(readFileSync(new URL("../src/lib/fixtures/flightView.json", import.meta.url), "utf8")) as Fixture;

/**
 * The connector's live view (decision 0061) as Claude shows it: the
 * page the gateway serves at /app/claude-view.html, in an iframe of a page
 * standing in for the host, which speaks the MCP Apps protocol to it
 * (spec 2026-01-26: ui/initialize, the tool's result pushed, tools/call
 * and ui/update-model-context back). The flight is the planner's own
 * answer (the shared fixture flightView.json, test_mcp_edits writes it).
 */
const HOST = `
<!doctype html><html><body style="margin:0">
<iframe id="view" style="width:420px;height:900px;border:0"></iframe>
<script>
  window.asked = []; window.told = [];
  const frame = document.getElementById("view");
  const say = (message) => frame.contentWindow.postMessage({ jsonrpc: "2.0", ...message }, "*");
  window.addEventListener("message", (event) => {
    const m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.method === "ui/initialize") {
      say({ id: m.id, result: {
        protocolVersion: m.params.protocolVersion,
        hostInfo: { name: "test-host", version: "1.0.0" },
        hostCapabilities: { serverTools: {}, openLinks: {}, updateModelContext: { text: {} } },
        hostContext: { theme: "light", displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"] },
      } });
    } else if (m.method === "ui/notifications/initialized") {
      say({ method: "ui/notifications/tool-result", params: { content: [{ type: "text", text: "C81 KMSN KDLH" }], structuredContent: window.answer } });
    } else if (m.method === "tools/call") {
      window.asked.push(m.params);
      say({ id: m.id, result: { content: [{ type: "text", text: "Activated the ILS." }], structuredContent: window.next } });
    } else if (m.method === "ui/update-model-context") {
      window.told.push(m.params);
      say({ id: m.id, result: {} });
    } else if (m.id !== undefined) {
      say({ id: m.id, result: {} });
    }
  });
</script></body></html>`;

async function openHost(page: Page, origin: string) {
  const active = {
    ...fixture,
    flight: { ...fixture.flight, procedures: "KDLH:I27" },
    view: {
      ...fixture.view,
      seq: 2,
      approaches: [{ ...fixture.view.approaches[0], loaded: false, state: "active, missed approach suspended" }],
    },
  };
  await page.goto(`${origin}/app/licences.txt`);
  await page.setContent(HOST);
  await page.evaluate(
    ([answer, next]) => Object.assign(window, { answer, next }),
    [{ ...fixture, view: { ...fixture.view, origin } }, active],
  );
  await page.locator("#view").evaluate((f: HTMLIFrameElement, src) => (f.src = src), `${origin}/app/claude-view.html`);
  return page.frameLocator("#view");
}

test("the live view draws the flight Claude plans and a tap changes it", { tag: "@smoke" }, async ({ page, baseURL }) => {
  const view = await openHost(page, baseURL!);
  await expect(view.getByRole("heading", { level: 1 })).toHaveText("C81 → KMSN → KDLH");
  await expect(view.getByTestId("view-figures")).toContainText("12.3");
  // The chart's tiles come from Wingtip itself, framing the route.
  await expect(view.getByTestId("view-chart").locator("img").first()).toHaveAttribute("src", /\/api\/planner\/chart-tile\/sec\//);
  await expect(view.getByTestId("view-approach-KDLH")).toContainText("loaded");

  await view.getByTestId("view-approach-KDLH").getByRole("button", { name: "Activate" }).click();
  await expect(view.getByTestId("view-approach-KDLH")).toContainText("active, missed approach suspended");
  const asked = await page.evaluate(() => (window as unknown as { asked: unknown[] }).asked);
  expect(asked).toEqual([{ name: "change_approach", arguments: { flight: fixture.flight, airport: "KDLH", action: "activate" } }]);
  const told = await page.evaluate(() => (window as unknown as { told: { content: { text: string }[] }[] }).told);
  expect(told[0]!.content[0]!.text).toContain("the pilot activated the ILS OR LOC RWY 27 at KDLH");
});
