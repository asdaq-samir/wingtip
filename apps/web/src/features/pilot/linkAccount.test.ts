// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

/** The gateway's client takes its Request and fetch as its module loads
 *  (lib/api/client.test's `me`), so both are stubbed and it is loaded
 *  afresh: Node makes no Request of a bare path as a browser does. */
async function answering(status: number, body?: unknown) {
  const NodeRequest = Request;
  vi.stubGlobal(
    "Request",
    class extends NodeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === "string" ? new URL(input, "http://localhost").href : input, init);
      }
    },
  );
  const fetch = vi.fn(async (_: Request) => new Response(body === undefined ? null : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  vi.resetModules();
  const { linkAccount } = await import("./linkAccount");
  return { fetch, linkAccount };
}

describe("linkAccount", () => {
  it("names the masked account a usable link signs in to, posting the token in the body", async () => {
    const { fetch, linkAccount } = await answering(200, { email: "a•••@icloud.com" });
    await expect(linkAccount("t0k")).resolves.toBe("a•••@icloud.com");
    const request = fetch.mock.calls[0]![0];
    expect(new URL(request.url).pathname).toBe("/api/auth/magic-link/account");
    expect(await request.text()).toBe("token=t0k");
  });

  it("answers null for a link that can no longer sign in", async () => {
    const { linkAccount } = await answering(404);
    await expect(linkAccount("spent")).resolves.toBeNull();
  });

  it("throws for anything else, so no account is named", async () => {
    const { linkAccount } = await answering(429);
    await expect(linkAccount("t")).rejects.toThrow();
  });
});
