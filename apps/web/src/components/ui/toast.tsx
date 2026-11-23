import { useEffect, type CSSProperties } from "react";
import { Toast } from "@base-ui/react/toast";
import { Check } from "lucide-react";
import { cn } from "cn";
import { Spinner } from "./spinner";
import { anchoredManager, toastManager } from "../../lib/toastManager";
import { toasterReady } from "../../lib/toast";

/**
 * The stock Base UI Toast, as shadcn's toast page now builds it
 * (docs/design/web.md, gap 3), in the app's look: Apple Maps' banner, a
 * frosted capsule round one line with a tick in the tint for a success
 * and a spinner while something is under way (index.css, data-slot
 * toast), and an Undo at its end where it has one (Base UI's Action). No
 * close button, as iOS's banners have none: each goes by itself after
 * Base UI's own 5 seconds, held while a finger or the pointer is on it
 * and put away with a swipe, and none of them is an error (lib/problems). Beside the stack, as Base UI's docs
 * keep them, the confirmations anchored to the control that made them
 * (lib/toast's `done`).
 */
export function Toaster({ position, style, className }: { position: "top" | "bottom"; style?: CSSProperties; className?: string }) {
  return (
    <>
      <Toast.Provider toastManager={anchoredManager} limit={3}>
        <Anchored className={className} />
      </Toast.Provider>
      <Stacked position={position} style={style} className={className} />
    </>
  );
}

function Stacked({ position, style, className }: { position: "top" | "bottom"; style?: CSSProperties; className?: string }) {
  return (
    <Toast.Provider toastManager={toastManager} limit={3}>
      <Ready />
      <Toast.Portal>
        <Toast.Viewport
          data-slot="toast-viewport"
          data-position={position}
          style={style}
          className={cn(
            "fixed left-(--toast-left) right-(--toast-right) z-100 mx-auto w-(--width) outline-none",
            position === "top" ? "top-(--offset-top)" : "bottom-(--offset-bottom)",
            className,
          )}
        >
          <Toasts position={position} />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

/** Tells lib/toast the Provider is listening: its own effect runs after
 *  its children's, so the word goes once this commit is done. */
function Ready() {
  useEffect(() => {
    const later = window.setTimeout(toasterReady, 0);
    return () => window.clearTimeout(later);
  }, []);
  return null;
}

/**
 * Each toast stands where Base UI's own offset puts it, the heights of the
 * newer ones before it (--toast-offset-y) and a gap each (--toast-index),
 * moved there by a transform, as Base UI's docs stack them: in a flex
 * column a progress line coming and going ("Planning…" over an "Airplane
 * Changed" Undo) laid the Undo out again 56 points away and back, a jump
 * (route-line.spec's layout shift, 0.011); now it slides.
 */
function Toasts({ position }: { position: "top" | "bottom" }) {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      // Base UI's own swipe to put it away, followed by the finger
      // (its --toast-swipe-movement variables): up at the top, as an iOS
      // banner goes, where the stock down sent it over the map (gestures
      // audit M4); down at the foot; and to the right in either.
      swipeDirection={position === "top" ? ["up", "right"] : ["down", "right"]}
      data-slot="toast"
      // One with an Undo takes a tap (index.css); the rest let it through
      // to the map under them.
      data-action={toast.actionProps ? "" : undefined}
      // A confirmation with no control to stand by (lib/toast's `done`).
      data-testid={toast.type === "success" ? "done-note" : undefined}
      className={cn(
        // Its corner radius.banner in px, not rem: iOS's corners do not
        // grow with Dynamic Type, and rounded-3xl came to 24.6 at 17.88 px
        // (the HIG review, the owner, 2026-11-21).
        "absolute inset-x-0 flex min-h-12 items-center gap-2 rounded-(--radius-banner) px-4 py-2.5 transition-[opacity,transform] duration-200 ease-out [--gap:0.5rem]",
        "data-limited:hidden data-ending-style:opacity-0 data-starting-style:opacity-0",
        "motion-safe:data-starting-style:translate-y-2 motion-reduce:transition-none",
        position === "top"
          ? "top-0 [transform:translate(var(--toast-swipe-movement-x),calc(var(--toast-offset-y)_+_var(--toast-index)_*_var(--gap)_+_var(--toast-swipe-movement-y)))]"
          : "bottom-0 [transform:translate(var(--toast-swipe-movement-x),calc(var(--toast-swipe-movement-y)_-_var(--toast-offset-y)_-_var(--toast-index)_*_var(--gap)))]",
      )}
    >
      {/* Its ✓ and spinner a row's leading glyph, 20 beside the 17-point
          title, as iOS sets a symbol beside Body; at 16 the glyph read
          smaller than its words (size.glyph-row; the scale audit's Q4). */}
      {toast.type === "success" && <Check className="size-(--size-glyph-row) shrink-0 text-tint" strokeWidth={2.5} aria-hidden />}
      {toast.type === "loading" && (
        <Spinner className="size-(--size-glyph-row) shrink-0" role="presentation" aria-label={undefined} aria-hidden />
      )}
      <Toast.Content className="flex min-w-0 flex-1 flex-col">
        <Toast.Title className="font-semibold" />
        <Toast.Description className="text-muted-foreground" />
      </Toast.Content>
      {/* The tint's word at the end, its 44 points by a pseudo-element. */}
      <Toast.Action className="relative -mr-1 shrink-0 rounded-full px-2 font-semibold text-tint outline-none hit-2 focus-visible:ring-2 focus-visible:ring-ring" />
    </Toast.Root>
  ));
}

/** The confirmations anchored to their controls: a small capsule with the
 *  tint's tick just above the control, as Apple's "Copied" by a button. */
function Anchored({ className }: { className?: string }) {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport data-slot="toast-viewport" className={cn("outline-none", className)}>
        {toasts.map((toast) => (
          <Toast.Positioner key={toast.id} toast={toast} className="z-100">
            <Toast.Root
              toast={toast}
              data-slot="toast"
              data-testid="done-note"
              className={cn(
                "flex max-w-[min(20rem,calc(100vw-2rem))] items-center gap-2 rounded-full px-3 py-2 shadow-md",
                "transition-[opacity,scale] duration-150 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none",
              )}
            >
              <Check className="size-(--size-glyph-row) shrink-0 text-tint" strokeWidth={2.5} aria-hidden />
              <Toast.Content className="flex min-w-0 items-baseline gap-2">
                <Toast.Title className="truncate font-semibold" />
                <Toast.Description className="truncate text-muted-foreground" />
              </Toast.Content>
            </Toast.Root>
          </Toast.Positioner>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
