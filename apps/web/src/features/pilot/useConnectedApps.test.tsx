// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api/errors";
import type { Connection } from "../../lib/api/types";
import { useConnectedApps } from "./useConnectedApps";

vi.mock("../../lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api/client")>()),
  api: { connections: { list: vi.fn(), disconnect: vi.fn() } },
}));
const { api } = await import("../../lib/api/client");
const shown = vi.hoisted(() => [] as string[]);
vi.mock("../../lib/problems", () => ({ showError: (title: string) => void shown.push(title) }));

const claude: Connection = { id: "a1", app: "Claude", scopes: "wingtip:read", renewedAt: null, until: null };
const chatgpt: Connection = { id: "b2", app: "ChatGPT", scopes: "wingtip:read", renewedAt: null, until: null };

function setUp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useConnectedApps(), { wrapper });
}

describe("You's Connected Apps", () => {
  it("lists the connections and ends the one asked, then reads the list again", async () => {
    vi.mocked(api.connections.list).mockResolvedValueOnce([claude, chatgpt]).mockResolvedValueOnce([chatgpt]);
    vi.mocked(api.connections.disconnect).mockResolvedValue(undefined);
    const { result } = setUp();
    await waitFor(() => expect(result.current.connections).toEqual([claude, chatgpt]));
    act(() => result.current.ask(claude));
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.connections).toEqual([chatgpt]));
    expect(api.connections.disconnect).toHaveBeenCalledWith("a1");
    expect(result.current.asked).toBeNull();
  });

  it("says nothing for a connection already gone, and says so for any other failure", async () => {
    shown.length = 0;
    vi.mocked(api.connections.list).mockResolvedValue([claude]);
    vi.mocked(api.connections.disconnect)
      .mockRejectedValueOnce(new ApiError("gone", 404))
      .mockRejectedValueOnce(new ApiError("down", 502));
    const { result } = setUp();
    await waitFor(() => expect(result.current.connections).toEqual([claude]));
    act(() => result.current.ask(claude));
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.ending).toBeUndefined());
    expect(shown).toEqual([]);
    act(() => result.current.ask(claude));
    act(() => result.current.confirm());
    await waitFor(() => expect(shown).toEqual(["The app was not disconnected"]));
  });
});
