// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

type Added = {
  id?: string;
  type?: string;
  title: string;
  timeout?: number;
  actionProps?: { children: string; onClick: () => void };
  positionerProps?: { anchor: Element };
};
const calls: string[] = [];
const added: Added[] = [];
const manager = (name: string) => ({
  add: (options: Added) => {
    added.push(options);
    calls.push(`${name}${options.type ?? "toast"} ${options.title}${options.timeout === 0 ? " (stays)" : ""}`);
    return options.id ?? "id";
  },
  close: (id?: string) => {
    calls.push(`${name}close ${id}`);
  },
});
vi.mock("./toastManager", () => ({ toastManager: manager(""), anchoredManager: manager("by its control: ") }));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("lib/toast", () => {
  it("asks for the toasts only at the first, and makes the calls in order once the Toaster listens", async () => {
    const { toast, loadToasts, toasterReady } = await import("./toast");
    // Nothing to take down before any toast: the chunk is not fetched for it.
    toast.dismiss("progress");
    await Promise.resolve();
    expect(calls).toEqual([]);

    toast.loading("Drawing course", { id: "progress" });
    toast.dismiss("progress");
    toast.success("Link copied");
    toast("Route changed");
    await loadToasts();
    await settle();
    // Base UI's manager tells only a Provider already listening: nothing
    // is lost while the Toaster mounts.
    expect(calls).toEqual([]);
    toasterReady();
    await settle();
    expect(calls).toEqual(["loading Drawing course (stays)", "close progress", "success Link copied", "toast Route changed"]);
  });

  it("gives an Undo its action, which does the undoing and takes the toast down", async () => {
    const { toast, UNDO_MS } = await import("./toast");
    calls.length = 0;
    const undo = vi.fn();
    const id = toast.undo("KMSN Removed", undo);
    await settle();
    const shown = added.at(-1)!;
    expect(shown).toMatchObject({ id, type: "undo", title: "KMSN Removed", timeout: UNDO_MS });
    expect(shown.actionProps?.children).toBe("Undo");
    shown.actionProps!.onClick();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(calls.at(-1)).toBe(`close ${id}`);
  });

  it("puts a confirmation by the control just used, and in the stack where there is none", async () => {
    const { toast } = await import("./toast");
    calls.length = 0;
    const save = document.createElement("button");
    document.body.append(save);
    save.getBoundingClientRect = () => ({
      left: 100,
      top: 300,
      width: 80,
      height: 40,
      right: 180,
      bottom: 340,
      x: 100,
      y: 300,
      toJSON: () => ({}),
    });
    save.focus();
    toast.done("Flight Saved");
    await settle();
    expect(calls.at(-1)).toBe("by its control: success Flight Saved");
    expect(added.at(-1)!.positionerProps?.anchor).toBe(save);

    save.blur();
    toast.done("Flight Saved");
    await settle();
    expect(calls.at(-1)).toBe("success Flight Saved");
  });
});
