import { useEffect, type CSSProperties } from "react";
import { Toast } from "@base-ui/react/toast";
import { Check } from "lucide-react";
import { cn } from "cn";
import { Spinner } from "./spinner";
import { toastManager } from "../../lib/toastManager";
import { toasterReady } from "../../lib/toast";

/**
 * The stock Base UI Toast, as shadcn's toast page now builds it
 * (docs/design/web.md, gap 3), in the app's look: Apple Maps' banner, a
 * frosted capsule round one line with a tick in the tint for a success
 * and a spinner while something is under way (index.css, data-slot
 * toast). No close button, as iOS's banners have none: each goes by
 * itself, and none of them is an error (lib/problems).
 */
export function Toaster({ position, style, className }: { position: "top" | "bottom"; style?: CSSProperties; className?: string }) {
  return (
    <Toast.Provider toastManager={toastManager} timeout={2000} limit={3}>
      <Ready />
      <Toast.Portal>
        <Toast.Viewport
          data-slot="toast-viewport"
          data-position={position}
          style={style}
          className={cn(
            "fixed inset-x-0 z-100 mx-auto flex w-(--width) flex-col items-stretch gap-2 outline-none",
            position === "top" ? "top-(--offset-top)" : "bottom-(--offset-bottom) flex-col-reverse",
            className,
          )}
        >
          <Toasts />
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

function Toasts() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      // A swipe removed a toast on the same touch that was meant to tap
      // what was under it, so none: each goes by itself in a few seconds.
      swipeDirection={[]}
      data-slot="toast"
      className={cn(
        "flex min-h-12 items-center gap-2 rounded-3xl px-4 py-2.5 transition-[opacity,transform] duration-200 ease-out",
        "data-limited:hidden data-ending-style:opacity-0 data-starting-style:opacity-0",
        "motion-safe:data-starting-style:translate-y-2 motion-reduce:transition-none",
      )}
    >
      {toast.type === "success" && <Check className="size-4 shrink-0 text-tint" strokeWidth={2.5} aria-hidden />}
      {toast.type === "loading" && <Spinner className="size-4 shrink-0" role="presentation" aria-label={undefined} aria-hidden />}
      <Toast.Content className="flex min-w-0 flex-col">
        <Toast.Title className="font-semibold" />
        <Toast.Description className="text-muted-foreground" />
      </Toast.Content>
    </Toast.Root>
  ));
}
