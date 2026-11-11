import { describe, expect, test } from "vitest";
import { timedInFlight } from "./inFlight";

describe("requests that send data, in flight", () => {
  test("given a timeout in flight, and only then", () => {
    const post = { method: "POST", body: "{}" };
    expect(timedInFlight(post, false)).toBe(post);
    expect(timedInFlight({ method: "GET" }, true)?.signal).toBeUndefined();
    expect(timedInFlight(post, true)?.signal).toBeInstanceOf(AbortSignal);
    expect(timedInFlight(post, true)?.body).toBe("{}");
  });

  test("the caller's own signal still aborts it", () => {
    const own = new AbortController();
    const timed = timedInFlight({ method: "POST", signal: own.signal }, true)!;
    own.abort();
    expect(timed.signal!.aborted).toBe(true);
  });
});
