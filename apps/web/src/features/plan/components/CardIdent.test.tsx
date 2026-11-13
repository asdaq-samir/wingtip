// @vitest-environment jsdom
/**
 * A card's ident takes the first suggestion on Return, as the route box
 * and the one search do (Base UI's autoHighlight), and what was typed where
 * it is a row's own ident or no list is offered.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

const search = vi.fn();
vi.mock("../../../lib/useAirportSearch", () => ({ useAirportSearch: (...a: unknown[]) => search(...a) }));

const { default: CardIdent } = await import("./CardIdent");

beforeAll(() => {
  // Base UI wants these of a browser.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

const rows = [
  { kind: "airport", ident: "KOSH", name: "Wittman Regional", city: "Oshkosh", state: "WI", lat: 0, lon: 0 },
  { kind: "airport", ident: "KOSU", name: "Ohio State", city: "Columbus", state: "OH", lat: 0, lon: 0 },
];

function setup(props: Partial<ComponentProps<typeof CardIdent>> = {}, typed = "kos") {
  search.mockReturnValue({ typed: typed.toUpperCase(), rows, answered: true });
  const onCommit = vi.fn();
  render(<CardIdent value="KUGN" label="Ident" testId="ident" onCommit={onCommit} {...props} />);
  const field = screen.getByTestId("ident");
  field.focus();
  fireEvent.change(field, { target: { value: typed } });
  return { field, onCommit };
}

describe("CardIdent", () => {
  test("Return takes the first suggestion, as the other searches do", () => {
    const { field, onCommit } = setup();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("KOSH");
  });

  test("Return takes what was typed where it is a suggestion's own ident", () => {
    const { field, onCommit } = setup({}, "kosu");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("KOSU");
  });

  test("Return takes what was typed where no list is offered (a rename)", () => {
    const { field, onCommit } = setup({ suggest: false });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("KOS");
  });

  test("asks for fixes only where told, and does not search for a rename", () => {
    setup();
    expect(search).toHaveBeenLastCalledWith("KOS", true, false);
    cleanup();
    setup({ fixes: true });
    expect(search).toHaveBeenLastCalledWith("KOS", true, true);
    cleanup();
    setup({ suggest: false });
    expect(search).toHaveBeenLastCalledWith("KOS", false, false);
  });
});
