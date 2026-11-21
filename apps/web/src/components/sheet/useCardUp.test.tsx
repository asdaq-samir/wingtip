// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardId } from "../../lib/sheetCards";
import { cardSettled, useSheetTop } from "./sheetTopSlot";
import { useCardUp } from "./useCardUp";

const inCard = ({ children }: { children: ReactNode }) => createElement(CardId.Provider, { value: "navlog" }, children);

afterEach(() => {
  cleanup();
  useSheetTop.setState({ up: [] });
  vi.useRealTimers();
});

describe("a card's later content", () => {
  it("is drawn at once outside a card", () => {
    expect(renderHook(() => useCardUp()).result.current).toBe(true);
  });

  it("waits for its card's drawer to come up, and stays drawn after", () => {
    const { result } = renderHook(() => useCardUp(), { wrapper: inCard });
    expect(result.current).toBe(false);
    act(() => cardSettled("navlog", true));
    expect(result.current).toBe(true);
    act(() => cardSettled("navlog", false));
    expect(result.current).toBe(true);
  });

  it("is not held for good by a drawer that never says it is up", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCardUp(), { wrapper: inCard });
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(800));
    expect(result.current).toBe(true);
  });
});
