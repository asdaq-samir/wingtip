import { describe, expect, it } from "vitest";
import { ApiError } from "./api/client";
import { noConnection } from "./problems";
import { retryDelay, retryOnServerFailure } from "./queryRetry";

const dropped = new TypeError("Load failed");

describe("a query's retries", () => {
  it("asks a lost connection again for as long as it is wanted", () => {
    expect(retryOnServerFailure(0, dropped)).toBe(true);
    expect(retryOnServerFailure(50, dropped)).toBe(true);
  });

  it("asks a lost connection again a second after the drop, then every half minute", () => {
    expect(retryDelay(0, dropped)).toBe(1000);
    expect(retryDelay(1, dropped)).toBe(30_000);
    expect(retryDelay(7, dropped)).toBe(30_000);
  });

  it("asks a server failure again three times, doubling", () => {
    const down = new ApiError("Bad gateway", 502);
    expect([0, 1, 2, 3].map((n) => retryOnServerFailure(n, down))).toEqual([true, true, true, false]);
    expect([0, 1, 2].map((n) => retryDelay(n, down))).toEqual([1000, 2000, 4000]);
  });

  it("says what the request got wrong at once", () => {
    expect(retryOnServerFailure(0, new ApiError("Not found", 404))).toBe(false);
  });
});

describe("no connection, in place", () => {
  it("is said while a dropped query is asked again", () => {
    expect(noConnection({ isError: false, fetchStatus: "fetching", failureReason: dropped })).toBe(true);
  });

  it("is said while a query waits, paused, for the phone to be back", () => {
    expect(noConnection({ isError: false, fetchStatus: "paused" })).toBe(true);
  });

  it("is not said for a server that answered no", () => {
    expect(noConnection({ isError: false, fetchStatus: "fetching", failureReason: new ApiError("Bad gateway", 502) })).toBe(false);
  });
});
