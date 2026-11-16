// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { exportFileName, useExportAccount } from "./useExportAccount";

const shared = vi.hoisted(() => vi.fn(async (_name: string, _type: string, _body: string) => {}));
vi.mock("../../lib/flightPlanFiles", () => ({ shareFile: shared }));
const shown = vi.hoisted(() => vi.fn());
vi.mock("../../lib/problems", () => ({ showError: shown }));
// The gateway's own client (lib/api/http), whose middleware maps a refusal
// to the app's words: what the hook asks, not a fetch of its own.
const get = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api/http", () => ({ gateway: { GET: get } }));

describe("the account's export", () => {
  it("is saved under the gateway's name, never into a folder", () => {
    expect(exportFileName('attachment; filename="wingtip-maps-2026-11-09.json"')).toBe("wingtip-maps-2026-11-09.json");
    expect(exportFileName('attachment; filename="../../evil.json"')).toBe("evil.json");
    expect(exportFileName(null, new Date("2026-11-09T12:00:00Z"))).toBe("wingtip-maps-2026-11-09.json");
  });
});

describe("exporting the account", () => {
  afterEach(() => {
    get.mockReset();
    shared.mockClear();
    shown.mockClear();
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) }, children);

  it("asks through the gateway's client and shares the file under its name", async () => {
    get.mockResolvedValue({
      data: '{"a":1}',
      response: new Response(null, { headers: { "Content-Disposition": 'attachment; filename="mine.json"' } }),
    });
    const { result } = renderHook(() => useExportAccount(), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(shared).toHaveBeenCalledWith("mine.json", "application/json", '{"a":1}'));
    expect(get).toHaveBeenCalledWith("/api/me/export", { parseAs: "text" });
  });

  it("says a refusal where the pilot is, in the client's words, and shares nothing", async () => {
    get.mockRejectedValue(new Error("You are signed out."));
    const { result } = renderHook(() => useExportAccount(), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(shown).toHaveBeenCalledWith("Your data was not exported", "You are signed out."));
    expect(shared).not.toHaveBeenCalled();
  });
});
