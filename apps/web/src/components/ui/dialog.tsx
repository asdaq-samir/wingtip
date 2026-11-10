import * as React from "react";
import { cn } from "cn";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { DIALOG_CORNERS, DIM, GLASS_SHEET } from "../../lib/mapChrome";
import { keepOpenOn, TOAST } from "./dismiss";

function Dialog({ onOpenChange, ...props }: DialogPrimitive.Root.Props) {
  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      // A toast is not outside it (ui/dismiss): tapping its close button
      // closed this instead of the toast.
      onOpenChange={(open, details) => {
        if (!open && keepOpenOn(details, TOAST)) return;
        onOpenChange?.(open, details);
      }}
      {...props}
    />
  );
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        cn("fixed inset-0 z-50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0", DIM),
        className,
      )}
      {...props}
    />
  );
}

/**
 * Its close is the caller's, in its title row (SheetDialog), as every
 * sheet's is: the stock one stood alone in the corner, over nothing.
 */
function DialogContent({
  className,
  children,
  glass = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  /** Liquid Glass with an iOS alert's round corners, over a light dim,
   *  at the owner's pick of the sheets audit (D3, 2026-10-17); false for
   *  what fills the screen (an airport's diagram), opaque and square. */
  glass?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-glass={glass ? "" : undefined}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 p-6 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          glass
            ? cn(GLASS_SHEET, DIALOG_CORNERS, "text-foreground")
            : "rounded-lg bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1.5 text-center sm:text-left", className)} {...props} />;
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg pointer-coarse:text-(length:--type-row) leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm pointer-coarse:text-(length:--type-detail) text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger };
