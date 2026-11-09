// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFailedAction } from "../lib/problems";
import FrequencyButton from "./FrequencyButton";

afterEach(() => {
  cleanup();
  useFailedAction.setState({ failed: null });
});

const clipboard = (writeText: (text: string) => Promise<void>) =>
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

describe("a frequency", () => {
  it("is copied as pilots write it, and says so", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    clipboard(writeText);
    render(<FrequencyButton mhz={118.3} name="Tower" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Tower 118.3" }));
    expect(writeText).toHaveBeenCalledWith("118.3");
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied Tower 118.3" }).textContent).toBe("Copied"));
  });

  it("as heard, is copied as heard, its name before it", () => {
    const writeText = vi.fn(async (_text: string) => {});
    clipboard(writeText);
    const { container } = render(<FrequencyButton mhz="125.35" name="Departure" named />);
    expect(container.textContent).toBe("Departure 125.35");
    fireEvent.click(screen.getByRole("button", { name: "Copy Departure 125.35" }));
    expect(writeText).toHaveBeenCalledWith("125.35");
  });

  it("refused by the browser, says so in the alert for a failed action", async () => {
    clipboard(async () => {
      throw new Error("denied");
    });
    render(<FrequencyButton mhz={121.5} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy 121.5" }));
    await waitFor(() => expect(useFailedAction.getState().failed?.title).toBe("Not Copied"));
  });
});
