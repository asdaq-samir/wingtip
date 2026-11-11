import { beforeEach, describe, expect, it } from "vitest";
import { WELCOME, welcomeDue, useTips } from "../../../lib/firstRunTips";
import { SAMPLE_FLIGHT } from "./useWelcome";

describe("the welcome", () => {
  beforeEach(() => useTips.setState({ seen: [] }));

  it("is due on a new device, seen once finished or skipped, and back with the tips", () => {
    expect(welcomeDue()).toBe(true);
    useTips.getState().see(WELCOME);
    expect(welcomeDue()).toBe(false);
    useTips.getState().reset();
    expect(welcomeDue()).toBe(true);
  });

  it("is not due where every tip was turned off", () => {
    useTips.setState({ seen: ["*"] });
    expect(welcomeDue()).toBe(false);
  });

  it("opens the same sample flight as the phones: Madison to Oshkosh, no stops", () => {
    expect(SAMPLE_FLIGHT).toEqual({ dep: "KMSN", stops: [], dest: "KOSH" });
  });
});
