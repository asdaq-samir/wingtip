import { describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("./toastManager", () => ({
  toastManager: {
    add: (options: { type?: string; title: string; timeout?: number }) => {
      calls.push(`${options.type ?? "toast"} ${options.title}${options.timeout === 0 ? " (stays)" : ""}`);
      return "id";
    },
    close: (id?: string) => {
      calls.push(`close ${id}`);
    },
  },
}));

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
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Base UI's manager tells only a Provider already listening: nothing
    // is lost while the Toaster mounts.
    expect(calls).toEqual([]);
    toasterReady();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(["loading Drawing course (stays)", "close progress", "success Link copied", "toast Route changed"]);
  });
});
