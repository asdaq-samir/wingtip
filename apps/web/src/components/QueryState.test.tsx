// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryObserver, onlineManager } from "@tanstack/react-query";
import QueryState from "./QueryState";
import { queryClient } from "../lib/queryClient";

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

const idle = { isLoading: false, isError: false, isFetching: false, refetch: () => {} };

describe("QueryState with no connection", () => {
  it("says No connection for a query paused for one, not nothing", () => {
    render(<QueryState query={{ ...idle, fetchStatus: "paused" }} fetching="Fetching the fields…" failed="The fields could not be had." />);
    expect(screen.getByRole("alert").textContent).toContain("No connection.");
  });

  it("says No connection for a request dropped, not that it could not be fetched", () => {
    const query = { ...idle, isError: true, error: new TypeError("Failed to fetch"), fetchStatus: "idle" as const };
    render(<QueryState query={query} fetching="Fetching the fields…" failed="The fields could not be had." />);
    expect(screen.getByRole("alert").textContent).toContain("No connection.");
    expect(screen.getByRole("alert").textContent).not.toContain("could not be had");
  });

  it("keeps the query's own words for a server's failure", () => {
    const query = { ...idle, isError: true, error: new Error("Bad Gateway"), fetchStatus: "idle" as const };
    render(<QueryState query={query} fetching="Fetching the fields…" failed="The fields could not be had." />);
    expect(screen.getByRole("alert").textContent).toContain("The fields could not be had.");
  });
});

describe("the query client offline", () => {
  it("still asks, so the service worker's kept answer is read (offlineFirst)", async () => {
    onlineManager.setOnline(false);
    const queryFn = vi.fn(async () => "kept");
    const observer = new QueryObserver(queryClient, { queryKey: ["offline-first-test"], queryFn });
    const answered = new Promise((done) => observer.subscribe((r) => r.data && done(r.data)));
    expect(await answered).toBe("kept");
    expect(queryFn).toHaveBeenCalledOnce();
  });
});
