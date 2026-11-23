// @vitest-environment jsdom
/**
 * A screen's deep link (`?open=…`, design/screens.json) opens it: the
 * scratchpad as You's page, and Weight & Balance as the Brief's Preflight
 * section, once there is a route for it to weigh.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address } from "../../../lib/address";
import { useConsoleOpen } from "../../../lib/mapChrome";
import { useWanted } from "../../../lib/navigation/wanted";
import { useWantedPage } from "../../../lib/navigation/wantedPage";
import { useTabAsk } from "../../plan";
import { useOpenScreen } from "./useOpenScreen";

function opened(open: string, routed: boolean) {
  const calls = { openBrief: vi.fn(), setAddress: vi.fn(async () => {}) };
  renderHook(() =>
    useOpenScreen({
      routed,
      address: { open } as unknown as Address,
      setAddress: calls.setAddress as never,
      setViewPick: () => {},
      setPanel: () => {},
      openBrief: calls.openBrief,
      openNavLogCard: () => {},
      openProfileCard: () => {},
      openNearest: () => {},
    }),
  );
  return calls;
}

afterEach(() => {
  useWantedPage.setState({ path: [] });
  useConsoleOpen.setState({ open: false });
  useTabAsk.setState({ ask: null });
  useWanted.setState({ screen: null });
});

describe("a screen's link", () => {
  it("opens the scratchpad, You's page beside the documents", () => {
    const { setAddress } = opened("scratchpad", false);
    expect(useConsoleOpen.getState().open).toBe(true);
    expect(useWantedPage.getState().path).toEqual(["scratchpad"]);
    // The link's word taken off the address.
    expect(setAddress).toHaveBeenCalledWith({ open: null });
  });

  it("opens Weight & Balance, the Brief's Preflight section, over the route", () => {
    const { openBrief } = opened("balance", true);
    expect(openBrief).toHaveBeenCalledOnce();
    expect(useTabAsk.getState().ask).toEqual({ tab: "preflight", section: "Weight & Balance", full: undefined });
    expect(useConsoleOpen.getState().open).toBe(false);
  });

  it("waits for a route before Weight & Balance", () => {
    const { openBrief } = opened("balance", false);
    expect(openBrief).not.toHaveBeenCalled();
    expect(useTabAsk.getState().ask).toBeNull();
  });
});
