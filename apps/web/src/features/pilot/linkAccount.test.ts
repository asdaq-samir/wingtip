// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { linkAccount } from "./linkAccount";

afterEach(() => vi.unstubAllGlobals());

function answering(status: number, body?: unknown) {
  const fetch = vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("linkAccount", () => {
  it("names the masked account a usable link signs in to, posting the token in the body", async () => {
    const fetch = answering(200, { email: "a•••@icloud.com" });
    await expect(linkAccount("t0k")).resolves.toBe("a•••@icloud.com");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/magic-link/account");
    expect(String(init.body)).toBe("token=t0k");
  });

  it("answers null for a link that can no longer sign in", async () => {
    answering(404);
    await expect(linkAccount("spent")).resolves.toBeNull();
  });

  it("throws for anything else, so no account is named", async () => {
    answering(429);
    await expect(linkAccount("t")).rejects.toThrow();
  });
});
