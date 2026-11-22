// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../lib/fixtures/flightView.json";
import { ClaudeView } from "./ClaudeView";

// The host, as the ext-apps SDK's useApp hands the view its App: the tool
// result it pushes, and the calls the view makes back.
const host = vi.hoisted(() => ({
  app: null as null | Record<string, unknown>,
  callServerTool: vi.fn(),
  updateModelContext: vi.fn(),
  openLink: vi.fn(),
}));
vi.mock("@modelcontextprotocol/ext-apps/react", () => ({
  useApp: ({ onAppCreated }: { onAppCreated: (app: Record<string, unknown>) => void }) => {
    if (!host.app) {
      host.app = {
        callServerTool: host.callServerTool,
        updateModelContext: host.updateModelContext,
        openLink: host.openLink,
        requestDisplayMode: vi.fn(),
        getHostContext: () => ({ theme: "light", displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"] }),
      };
      onAppCreated(host.app);
    }
    return { app: host.app, isConnected: true, error: null };
  },
}));

const pushed = (structuredContent: unknown) =>
  act(() => (host.app!.ontoolresult as (r: unknown) => void)({ content: [], structuredContent }));

const text = (testId: string) => screen.getByTestId(testId).textContent ?? "";

describe("the connector's live view", () => {
  beforeEach(() => {
    host.app = null;
    vi.clearAllMocks();
    // jsdom lays nothing out: the chart's box is measured as none.
    globalThis.ResizeObserver ??= class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  });

  it("waits for the flight, then draws its route, figures and approach", () => {
    render(<ClaudeView />);
    expect(text("view-waiting")).toContain("Planning the flight");
    pushed(fixture);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("C81 → KMSN → KDLH");
    expect(text("view-point-KMSN")).toContain("+");
    expect(text("view-approach-KDLH")).toContain("ILS OR LOC RWY 27");
    expect(text("view-figures")).toContain("12.3");
    expect(text("view-fuel-stops")).toContain("Remove Fuel Stops");
  });

  it("asks the connector for a tap's change and tells Claude what the pilot did", async () => {
    render(<ClaudeView />);
    pushed(fixture);
    const without = {
      ...fixture,
      flight: { ...fixture.flight, stops: [] },
      view: { ...fixture.view, seq: 2, points: [fixture.view.points[0], fixture.view.points[2]] },
    };
    host.callServerTool.mockResolvedValueOnce({ content: [{ type: "text", text: "Removed KMSN." }], structuredContent: without });
    fireEvent.click(screen.getByTestId("view-remove-KMSN"));
    await waitFor(() => expect(host.updateModelContext).toHaveBeenCalled());
    expect(host.callServerTool).toHaveBeenCalledWith({ name: "remove_stop", arguments: { flight: fixture.flight, ident: "KMSN" } });
    expect(host.updateModelContext.mock.calls[0]![0].content[0].text).toContain("the pilot removed the stop KMSN");
    await waitFor(() => expect(screen.queryByTestId("view-point-KMSN")).toBeNull());
  });

  it("says where a change failed, and opens the flight in Wingtip", async () => {
    render(<ClaudeView />);
    pushed(fixture);
    host.callServerTool.mockResolvedValueOnce({ isError: true, content: [{ type: "text", text: "Not allowed wingtip:write" }] });
    fireEvent.click(screen.getByTestId("view-save"));
    expect((await screen.findByTestId("view-problem")).textContent).toContain("Not allowed wingtip:write");
    fireEvent.click(screen.getByTestId("view-open"));
    expect(host.openLink).toHaveBeenCalledWith({ url: fixture.view.open_in_wingtip });
  });
});
