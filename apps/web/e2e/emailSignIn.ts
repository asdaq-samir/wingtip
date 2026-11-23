import { expect, request, type APIRequestContext, type Page } from "@playwright/test";
import { consolePage, openConsole } from "./helpers";

/**
 * Signing in the way a person does on the local stack: the emailed
 * link, from the inbox docker-compose.yml runs beside the gateway
 * (Mailpit, its API on port 8025). MAILPIT_URL overrides where that
 * is; MAILPIT_UI_AUTH, `user:password`, is the password
 * docker-compose.yml puts on it once PUBLISH_ADDRESS opens it to the Wi-Fi.
 */

/** The address the suite runs as, a developer on the local stack
 *  whatever .env lists (docker-compose.yml's APP_DEVELOPER_EMAILS). */
export const DEVELOPER = "developer@example.com";
/** That developer's session, written by auth.setup.ts and opened by
 *  every test that does not say otherwise (playwright.config.ts). */
export const DEVELOPER_STATE = "e2e/.auth/developer.json";

const auth = process.env.MAILPIT_UI_AUTH;

async function inbox() {
  return request.newContext({
    baseURL: process.env.MAILPIT_URL ?? "http://localhost:8025",
    extraHTTPHeaders: auth ? { Authorization: `Basic ${Buffer.from(auth).toString("base64")}` } : {},
  });
}

async function messagesTo(address: string): Promise<string[]> {
  const mail = await inbox();
  const res = await mail.get("/api/v1/search", { params: { query: `to:"${address}"` } });
  expect(res.ok(), `the inbox answered ${res.status()}`).toBe(true);
  const { messages } = (await res.json()) as { messages: { ID: string }[] };
  await mail.dispose();
  return messages.map((m) => m.ID);
}

async function linkIn(id: string): Promise<URL> {
  const mail = await inbox();
  const { Text } = (await (await mail.get(`/api/v1/message/${id}`)).json()) as { Text: string };
  await mail.dispose();
  const link = Text.match(/\S+\/api\/auth\/magic-link\/verify\?token=\S+/)?.[0];
  if (!link) throw new Error(`no sign-in link in message ${id}: ${Text}`);
  return new URL(link);
}

/**
 * Asks for a link for `address` from the pilot console, opening it
 * first if it is not already, then opens the link from the inbox and
 * presses Sign in in the planner's dialog it lands on. The link
 * points at APP_PUBLIC_BASE_URL; it is opened at the address this run
 * is testing instead, so the session lands in this browser.
 *
 * One test at a time per address: two asking at once would each read
 * whichever link came in first.
 */
export async function signInByEmail(page: Page, address: string) {
  await openLinkFor(page, address);
  await page.getByRole("dialog").getByRole("button", { name: "Sign In", exact: true }).click();
}

/** The session's XSRF-TOKEN, as the app echoes it on a write
 *  (lib/api/http's csrfHeaders): Spring's single-page setup writes the
 *  cookie on every answer, and a sign-in replaces it. */
async function xsrf(api: APIRequestContext): Promise<Record<string, string>> {
  await api.get("/api/me");
  const token = (await api.storageState()).cookies.find((c) => c.name === "XSRF-TOKEN")?.value;
  return token ? { "X-XSRF-TOKEN": decodeURIComponent(token) } : {};
}

/**
 * Signs `address` in with no page: the same three calls the pilot
 * console's sign-in makes (gatewayPilot's requestMagicLink, the link
 * from the inbox, finishMagicLink's POST of its token), on `api`'s own
 * cookies. The suite's shared session is made so (auth.setup.ts): from
 * the page, it waited on the map and its sheet to settle first, and on a
 * loaded runner that timed out and held every project of the shard
 * (11-21 and 11-22's nights; CI audit 2026-11-23, M6). The sign-in as a
 * pilot does it is signin.spec's.
 */
export async function signInByApi(api: APIRequestContext, address: string) {
  const before = new Set(await messagesTo(address));
  const asked = await api.post("/api/auth/magic-link", { data: { email: address }, headers: await xsrf(api) });
  expect(asked.status(), "a sign-in link asked for").toBeLessThan(300);
  let id: string | undefined;
  await expect
    .poll(async () => (id = (await messagesTo(address)).find((m) => !before.has(m))), { message: `a sign-in email to ${address}` })
    .toBeTruthy();
  const token = (await linkIn(id!)).searchParams.get("token") ?? "";
  // Where the server sends a signed-in browser (the dev page, for a
  // developer) is not followed: the session's cookie is what is wanted.
  const verified = await api.post("/api/auth/magic-link/verify", { form: { token }, headers: await xsrf(api), maxRedirects: 0 });
  expect(verified.status(), "the link's token spent").toBeLessThan(400);
}

/** Clears the signed-in account's home base by API, its telephone number
 *  sent back as it is (PUT /api/me/contact takes both; blank is none). */
export async function blankHomeBase(api: APIRequestContext) {
  const me = (await (await api.get("/api/me")).json()) as { phone?: string | null };
  const answer = await api.put("/api/me/contact", { data: { phone: me.phone ?? "", homeBase: "" }, headers: await xsrf(api) });
  expect(answer.status(), "the account's home base cleared").toBe(200);
}

/** Asks for a link for `address` and opens it: the planner, with its
 *  sign-in dialog up. Answers the link, to open again. */
export async function openLinkFor(page: Page, address: string): Promise<string> {
  const console = page.getByTestId("console-sheet");
  const before = new Set(await messagesTo(address));
  if (!(await console.isVisible())) await openConsole(page);
  // Signed out, Sign In is You's head's large line, under the avatar (YouHead).
  await consolePage(console, "Account");
  await console.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.getByLabel("Email Address").fill(address);
  await page.getByRole("button", { name: "Send Link" }).click();
  // The dialog's own status line: a toast is a status too (Base UI's),
  // and on the plan page the planner's progress toast is often up.
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(`Check ${address}`);

  let id: string | undefined;
  await expect
    .poll(async () => (id = (await messagesTo(address)).find((m) => !before.has(m))), { message: `a sign-in email to ${address}` })
    .toBeTruthy();
  const link = await linkIn(id!);
  const path = link.pathname + link.search;
  await page.goto(path);
  await expect(page.getByRole("dialog").getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
  return path;
}
