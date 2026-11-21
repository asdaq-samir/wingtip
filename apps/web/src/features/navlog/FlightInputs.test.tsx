// @vitest-environment jsdom
/**
 * FPL's airplane pill (FlightInputs): what is typed is taken on Enter only,
 * once, never as the field is left half typed, and a registry's late answer
 * for an airplane picked before never puts it back. The suggestions and the
 * registry are stood in for; the N-number test is the engine's
 * (lib/engine/vitestSetup.ts loads it). And "Pick the airplane" asked from
 * a card over FPL lands in the field once the card has gone. Its ⓘ opens
 * the airplane's card, or with none picked asks for one in the field.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import FlightInputs from "./FlightInputs";
import { requestAirplanePick, useAirplanePick } from "../../lib/pickAirplane";
import { useProfileOpen } from "../../lib/airplane/profileStore";

// Each tail's registry answer, settled by the test.
const answers = new Map<string, (record: { profile: string }) => void>();

vi.mock("../../lib/airplane/lookup", () => ({
  registeredQuery: (tail: string) => ({
    queryKey: ["registered", tail],
    queryFn: () => new Promise((resolve) => answers.set(tail, resolve)),
  }),
}));
vi.mock("../../lib/aircraftChoice", async (actual) => ({
  ...(await actual<typeof import("../../lib/aircraftChoice")>()),
  profileOfRegistered: (record: { profile: string }) => record.profile,
}));
vi.mock("./useAirplaneSuggestions", () => ({ useAirplaneSuggestions: () => ({ open: false, groups: [], dismiss: () => undefined }) }));

afterEach(() => {
  cleanup();
  answers.clear();
});

function pills(aircraftValue = "", aircraftOptions: { value: string; label: string }[] = []) {
  const onAircraftChange = vi.fn();
  const onTailPick = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FlightInputs
        aircraftValue={aircraftValue}
        aircraftOptions={aircraftOptions}
        onAircraftChange={onAircraftChange}
        onTailPick={onTailPick}
        depart=""
      />
    </QueryClientProvider>,
  );
  const input = screen.getByTestId<HTMLInputElement>("aircraft-input");
  const type = (text: string) => {
    act(() => input.focus());
    fireEvent.change(input, { target: { value: text } });
  };
  return { input, type, onAircraftChange, onTailPick };
}

describe("FlightInputs' airplane", () => {
  test("left half typed, nothing is taken and the airplane stays", () => {
    const { input, type, onAircraftChange, onTailPick } = pills("mine", [{ value: "mine", label: "N12345" }]);
    expect(input.value).toBe("12345");
    type("N4");
    expect(input.value).toBe("4");
    act(() => input.blur());
    expect(onTailPick).not.toHaveBeenCalled();
    expect(onAircraftChange).not.toHaveBeenCalled();
    expect(input.value).toBe("12345");
  });

  test("Enter takes what is typed once", () => {
    const { input, type, onTailPick } = pills();
    type("N181PA");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onTailPick).toHaveBeenCalledExactlyOnceWith("N181PA", "");
    expect(answers.size).toBe(1);
  });

  test("a registry's late answer for an airplane picked before is dropped", async () => {
    const { input, type, onTailPick } = pills();
    type("N111A");
    fireEvent.keyDown(input, { key: "Enter" });
    type("N222B");
    fireEvent.keyDown(input, { key: "Enter" });
    // The first airplane's answer comes after the second was asked for.
    await act(async () => {
      answers.get("N111A")!({ profile: "C172S" });
      await new Promise((settled) => setTimeout(settled, 10));
    });
    expect(onTailPick).not.toHaveBeenCalledWith("N111A", "C172S");
    await act(async () => {
      answers.get("N222B")!({ profile: "PA-28-181" });
      await new Promise((settled) => setTimeout(settled, 10));
    });
    expect(onTailPick).toHaveBeenLastCalledWith("N222B", "PA-28-181");
  });

  test("Pick the airplane asked from a card over FPL takes the focus back once the card has gone", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    try {
      const { input } = pills();
      // The Brief's card, open over FPL, its action holding the focus.
      const card = document.createElement("div");
      card.setAttribute("data-sheet-card", "");
      card.setAttribute("data-open", "");
      const action = document.createElement("button");
      card.append(action);
      document.body.append(card);
      act(() => requestAirplanePick());
      expect(useAirplanePick.getState().pending).toBe(true);
      // The card closes, its drawer handing the focus back as it goes: to
      // the action inside it, then the body as it is taken off.
      card.removeAttribute("data-open");
      action.focus();
      card.remove();
      expect(document.activeElement).toBe(document.body);
      act(() => vi.advanceTimersByTime(100));
      expect(document.activeElement).toBe(input);
      expect(useAirplanePick.getState().pending).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("its ⓘ opens the airplane's card, and with none picked puts the focus in the field", () => {
    useProfileOpen.setState({ open: null });
    const { input } = pills("mine", [{ value: "mine", label: "N12345" }]);
    fireEvent.click(screen.getByRole("button", { name: "Airplane info" }));
    expect(useProfileOpen.getState().open).toEqual({ tail: "N12345", focus: null });
    cleanup();
    useProfileOpen.setState({ open: null });
    const none = pills();
    fireEvent.click(screen.getByRole("button", { name: "Airplane info" }));
    expect(useProfileOpen.getState().open).toBeNull();
    expect(document.activeElement).toBe(none.input);
    expect(input.isConnected).toBe(false);
  });
});
