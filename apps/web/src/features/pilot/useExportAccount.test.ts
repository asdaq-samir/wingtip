import { describe, expect, it } from "vitest";
import { exportFileName } from "./useExportAccount";

describe("the account's export", () => {
  it("is saved under the gateway's name, never into a folder", () => {
    expect(exportFileName('attachment; filename="wingtip-maps-2026-11-09.json"')).toBe("wingtip-maps-2026-11-09.json");
    expect(exportFileName('attachment; filename="../../evil.json"')).toBe("evil.json");
    expect(exportFileName(null, new Date("2026-11-09T12:00:00Z"))).toBe("wingtip-maps-2026-11-09.json");
  });
});
