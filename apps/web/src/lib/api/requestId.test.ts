import { afterEach, describe, expect, it, vi } from "vitest";
import { REQUEST_ID_HEADER, newRequestId, requestIdHeaders } from "./requestId";

/** The gateway takes an id of up to 64 letters, digits, dots, dashes and
 *  underscores (RequestIdFilter), and makes its own of anything else. */
const TOKEN = /^[A-Za-z0-9._-]{1,64}$/;

describe("request id", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is a new token the gateway takes, each call", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).toMatch(TOKEN);
    expect(b).toMatch(TOKEN);
    expect(a).not.toBe(b);
  });

  it("is still a token outside a secure context, where crypto.randomUUID is missing", () => {
    vi.stubGlobal("crypto", {});
    expect(newRequestId()).toMatch(TOKEN);
  });

  it("goes in a plain fetch's headers as X-Request-Id", () => {
    expect(Object.keys(requestIdHeaders())).toEqual([REQUEST_ID_HEADER]);
  });
});
