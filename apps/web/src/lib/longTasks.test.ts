import { describe, expect, it } from "vitest";
import { longTaskReport } from "./longTasks";
import { DEMO_AIRPLANE, DEMO_FLIGHT, DEMO_HREF } from "./demoFlight";

describe("long task reports", () => {
  it("say how many, how long in all and the longest, in whole milliseconds, and nothing else", () => {
    const report = longTaskReport([52.4, 180.6, 75], "plan", { platform: "web", version: "abc123", device: "phone" });
    expect(report).toEqual({
      platform: "web", version: "abc123", device: "phone", page: "plan",
      metrics: { long_tasks: 3, long_task_ms: 308, longest_task_ms: 181 },
    });
  });
});

describe("the demo flight", () => {
  it("is Madison to Oshkosh in the stock Cessna 172, as on the phones", () => {
    expect(DEMO_FLIGHT).toEqual({ dep: "KMSN", dest: "KOSH" });
    expect(DEMO_AIRPLANE.profile).toBe("c172");
    expect(DEMO_HREF).toBe("/plan?dep=KMSN&dest=KOSH");
  });
});
