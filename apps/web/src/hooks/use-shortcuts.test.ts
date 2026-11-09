// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onShortcut } from "./use-shortcuts";

/** A panel with its tabs, a search field and a close, all in sight. */
function page() {
  document.body.innerHTML = `
    <section data-slot="map-panel">
      <button data-testid="tab-fpl">FPL</button><button data-testid="tab-airport">Airport</button>
      <button data-testid="tab-aircraft">Airplane</button><button data-testid="setup-button">Setup</button>
      <input type="search" aria-label="Search airports" />
      <button data-testid="tab-close">Back</button>
    </section>
    <input id="field" />`;
}

const press = (key: string, target: Element = document.body) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe("a desktop's shortcuts", () => {
  beforeEach(() => {
    page();
    // jsdom lays nothing out: everything here is in sight.
    HTMLElement.prototype.checkVisibility = () => true;
    document.addEventListener("keydown", onShortcut);
  });
  afterEach(() => document.removeEventListener("keydown", onShortcut));

  it("/ goes to the search field", () => {
    expect(press("/").defaultPrevented).toBe(true);
    expect(document.activeElement?.getAttribute("type")).toBe("search");
  });

  it("1 to 4 open the panel's tabs, FPL, Airport, Airplane and Setup", () => {
    const tapped: string[] = [];
    for (const b of document.querySelectorAll("button")) b.addEventListener("click", () => tapped.push(b.textContent!));
    for (const key of ["1", "2", "3", "4"]) press(key);
    expect(tapped).toEqual(["FPL", "Airport", "Airplane", "Setup"]);
  });

  it("Escape goes back one level by the panel's close", () => {
    const back = vi.fn();
    document.querySelector('[data-testid="tab-close"]')!.addEventListener("click", back);
    press("Escape");
    expect(back).toHaveBeenCalledOnce();
  });

  it("leaves a key typed in a field, and one already used, alone", () => {
    const field = document.getElementById("field")!;
    field.focus();
    expect(press("/", field).defaultPrevented).toBe(false);
    expect(press("2", field).defaultPrevented).toBe(false);
    const used = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    used.preventDefault();
    const back = vi.fn();
    document.querySelector('[data-testid="tab-close"]')!.addEventListener("click", back);
    document.body.dispatchEvent(used);
    expect(back).not.toHaveBeenCalled();
  });
});
