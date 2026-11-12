import { describe, expect, it } from "vitest";
import { modeOf, routeSearch } from "./use-dev-mode";

describe("the app's pages", () => {
  it("knows each by its address", () => {
    expect(modeOf("/plan")).toBe("pilot");
    expect(modeOf("/dev")).toBe("developer");
    expect(modeOf("/studio")).toBe("studio");
  });

  it("carries the route between them and nothing of a page's own", () => {
    expect(routeSearch("?dep=KOSH&dest=C81&view=briefing&q=N14511")).toBe("?dep=KOSH&dest=C81");
  });
});
