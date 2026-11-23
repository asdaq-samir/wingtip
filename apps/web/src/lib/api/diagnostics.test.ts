import { describe, expect, it, vi } from "vitest";
import { sendDiagnostics } from "./diagnostics";

const report = { platform: "web", version: "dev", device: "desktop", metrics: { long_tasks: 1 } } as const;

describe("the diagnostics door", () => {
  it("sends a report by beacon while Help Improve Wingtip Maps is on", () => {
    const sendBeacon = vi.fn(() => true);
    expect(sendDiagnostics(report, { sendBeacon } as unknown as Navigator, () => true)).toBe(true);
    expect(sendBeacon).toHaveBeenCalledWith(expect.any(String), expect.any(Blob));
  });

  it("sends nothing once the pilot has turned it off", () => {
    const sendBeacon = vi.fn(() => true);
    expect(sendDiagnostics(report, { sendBeacon } as unknown as Navigator, () => false)).toBe(false);
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});
