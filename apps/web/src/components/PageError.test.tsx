// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PageErrorBoundary } from "./PageError";
import { sendReport } from "../lib/errorReports";

vi.mock("../lib/errorReports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/errorReports")>()),
  sendReport: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Broken(): never {
  throw new Error("chunk gone");
}

describe("a page that could not be drawn", () => {
  it("draws its page while nothing throws", () => {
    render(
      <PageErrorBoundary>
        <p>the map</p>
      </PageErrorBoundary>,
    );
    expect(screen.getByText("the map")).toBeTruthy();
  });

  it("says so in the page's place, with Reload, and reports what threw", () => {
    // React logs a caught render error to the console; not this test's to show.
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <PageErrorBoundary>
        <Broken />
      </PageErrorBoundary>,
    );
    expect(screen.getByTestId("page-error")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(vi.mocked(sendReport)).toHaveBeenCalledTimes(1);
  });
});
