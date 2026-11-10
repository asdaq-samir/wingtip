import { useSyncExternalStore, type ReactNode } from "react";

/**
 * Brief news that goes by itself -- the progress line, "Charts Saved
 * Offline" -- as Base UI's Toast, the toast shadcn's own page now opens
 * (docs/design/web.md, gap 3), where it was sonner. What went wrong is
 * never a toast: it is said where it happens (lib/problems).
 *
 * The toast's code is fetched at the first toast, not in the first load
 * (issue #290): the manager and the Toaster are one chunk
 * (lib/toastManager, components/ui/toast), and AppToaster mounts the
 * Toaster once it is asked for. Base UI's manager tells only a Provider
 * already listening, so the calls made before then wait for it
 * (`toasterReady`) and are made in the order they were asked.
 *
 * Only what the app calls: a toast, success, loading and dismiss, with
 * sonner's shape (an id to update one in place, a line under the title,
 * how long it stays), so the callers did not change.
 */
type Manager = typeof import("./toastManager").toastManager;
type Message = ReactNode;
export interface ToastData {
  id?: string;
  description?: ReactNode;
  /** How long it stays, ms; 0 until taken down. */
  duration?: number;
}

let manager: Promise<Manager> | null = null;
let ready: () => void = () => {};
const mounted = new Promise<void>((resolve) => {
  ready = resolve;
});
const listeners = new Set<() => void>();

/** The manager, asked for once; AppToaster mounts its Toaster from then on. */
export function loadToasts(): Promise<Manager> {
  if (!manager) {
    manager = import("./toastManager").then((m) => m.toastManager);
    listeners.forEach((listener) => listener());
  }
  return manager;
}

/** The Toaster is listening (AppToaster, once its Provider has subscribed). */
export const toasterReady = () => ready();

/** Whether the toasts have been asked for, for AppToaster. */
export function useToastsWanted(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => manager != null,
  );
}

// One queue, so a call made before the Toaster was ready keeps its place
// before one made after it.
let queue: Promise<unknown> = Promise.resolve();
const later = (call: (m: Manager) => void) => {
  queue = queue.then(() => Promise.all([loadToasts(), mounted])).then(([m]) => call(m));
};

function add(type: string | undefined, title: Message, data?: ToastData) {
  later((m) =>
    m.add({
      id: data?.id,
      title,
      description: data?.description,
      type,
      // A loading toast stays till it is taken down or replaced, as sonner's.
      timeout: data?.duration ?? (type === "loading" ? 0 : undefined),
    }),
  );
}

export const toast = Object.assign((message: Message, data?: ToastData) => add(undefined, message, data), {
  success(message: Message, data?: ToastData) {
    add("success", message, data);
  },
  loading(message: Message, data?: ToastData) {
    add("loading", message, data);
  },
  /** Nothing to take down before a toast was ever asked for. */
  dismiss(id?: string) {
    if (manager) later((m) => m.close(id));
  },
});
