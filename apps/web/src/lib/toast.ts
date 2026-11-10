import { useSyncExternalStore, type ReactNode } from "react";

/**
 * Brief news that goes by itself -- the progress line, "Charts Saved
 * Offline", "Route Cleared · Undo" -- as Base UI's Toast, the toast
 * shadcn's own page now opens (docs/design/web.md, gap 3), where it was
 * sonner. A confirmation with Undo is a toast with its action (Base UI's
 * `actionProps`, the web's stock confirmation, at the owner's ask,
 * 2026-11-10), and a confirmation of a control's ("Copied") an anchored
 * toast by that control (`done`). What went wrong is never a toast: it is
 * said where it happens (lib/problems).
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
type Managers = typeof import("./toastManager");
type Message = ReactNode;
export interface ToastData {
  id?: string;
  description?: ReactNode;
  /** How long it stays, ms; 0 until taken down. */
  duration?: number;
  /** Its one button (Undo): the toast goes once it is pressed. */
  action?: { label: string; onClick: () => void; testId?: string };
  /** Gone, by its time or its action. */
  onClose?: () => void;
}

/** How long an Undo stays: long enough to read it and reach it. */
export const UNDO_MS = 8_000;
/** How long a confirmation by its control stays, as Apple's "Copied". */
const DONE_MS = 2_000;

let manager: Promise<Managers> | null = null;
let ready: () => void = () => {};
const mounted = new Promise<void>((resolve) => {
  ready = resolve;
});
const listeners = new Set<() => void>();

/** The managers, asked for once; AppToaster mounts its Toaster from then on. */
export function loadToasts(): Promise<Managers> {
  if (!manager) {
    manager = import("./toastManager");
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
// The chunk asked for at once, so a dismiss right after a toast finds it
// asked for and is queued behind it, never dropped.
const later = (call: (m: Managers) => void) => {
  const asked = loadToasts();
  queue = queue.then(() => Promise.all([asked, mounted])).then(([m]) => call(m));
};

let next = 1;

function add(type: string | undefined, title: Message, data?: ToastData): string {
  // Its own id where none is given, for its action to take it down by.
  const id = data?.id ?? `toast-${next++}`;
  const action = data?.action;
  later(({ toastManager: m }) =>
    m.add({
      id,
      title,
      description: data?.description,
      type,
      // A loading toast stays till it is taken down or replaced, as sonner's.
      timeout: data?.duration ?? (type === "loading" ? 0 : undefined),
      onClose: data?.onClose,
      actionProps: action && {
        children: action.label,
        // Base UI leaves the closing to the action's own handler.
        onClick: () => {
          action.onClick();
          m.close(id);
        },
        ...(action.testId ? { "data-testid": action.testId } : {}),
      },
    }),
  );
  return id;
}

/** Where a confirmation goes: by the control just used, or with none (one
 *  the tap took off the screen, a sheet closing) in the stack. */
function anchorOf(near: Element | null | undefined): Element | null {
  const el = near === undefined ? (typeof document === "undefined" ? null : document.activeElement) : near;
  if (!el || el === document.body || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  return r.width || r.height ? el : null;
}

export const toast = Object.assign((message: Message, data?: ToastData) => add(undefined, message, data), {
  success(message: Message, data?: ToastData) {
    return add("success", message, data);
  },
  loading(message: Message, data?: ToastData) {
    return add("loading", message, data);
  },
  /** What was just taken away and Undo, which gives it back: "KMSN
   *  Removed · Undo". Its id, to take it down when it no longer applies. */
  undo(message: Message, onUndo: () => void, data?: Omit<ToastData, "action"> & { testId?: string }) {
    const { testId, ...rest } = data ?? {};
    return add("undo", message, { duration: UNDO_MS, ...rest, action: { label: "Undo", onClick: onUndo, testId } });
  },
  /** A confirmation by the control that made it ("Flight Saved" by its
   *  Save, "Link Copied" by Share): Base UI's anchored toast, with the
   *  tint's tick, gone in two seconds; `near` the control, the one with
   *  the focus where none is given. */
  done(message: Message, options: { detail?: ReactNode; near?: Element | null } = {}) {
    const anchor = anchorOf(options.near);
    if (!anchor) {
      add("success", message, { description: options.detail, duration: DONE_MS });
      return;
    }
    later(({ anchoredManager: m }) =>
      m.add({
        title: message,
        description: options.detail,
        type: "success",
        timeout: DONE_MS,
        positionerProps: { anchor, side: "top", sideOffset: 8 },
      }),
    );
  },
  /** Nothing to take down before a toast was ever asked for. */
  dismiss(id?: string) {
    if (manager) later(({ toastManager: m }) => m.close(id));
  },
});
