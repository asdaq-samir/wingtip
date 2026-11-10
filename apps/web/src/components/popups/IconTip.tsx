import { useEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "cn";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { EXPANDED_BUTTON } from "../expandedButton";

type Props = ComponentProps<typeof Button> & {
  /** Names the button once: the tooltip's text and the accessible name. */
  label: string;
};

/** IconButton with its tooltip, from the popups' chunk (popupsChunk). */
export function IconTip({
  label,
  variant = "ghost",
  size = "icon",
  className,
  children,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  onClick,
  ...props
}: Props) {
  const [open, setOpen] = useState(false);
  const pressTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const labelShown = useRef(false);
  useEffect(
    () => () => {
      window.clearTimeout(pressTimer.current);
      window.clearTimeout(hideTimer.current);
    },
    [],
  );
  const endPress = () => window.clearTimeout(pressTimer.current);
  return (
    <Tooltip
      open={open}
      // The tooltip opens on a pointer, never on focus: a sheet opening
      // focuses its first control, and the tooltip that popped up over it
      // took the Escape meant for the sheet. The accessible name is the
      // label either way.
      onOpenChange={(next, details) => {
        if (next && details.reason === "trigger-focus") return;
        setOpen(next);
      }}
    >
      <TooltipTrigger
        delay={0}
        render={
          <Button
            variant={variant}
            size={size}
            aria-label={label}
            className={cn(EXPANDED_BUTTON, className)}
            onPointerDown={(e) => {
              onPointerDown?.(e);
              if (e.pointerType !== "touch") return;
              labelShown.current = false;
              endPress();
              pressTimer.current = window.setTimeout(() => {
                labelShown.current = true;
                setOpen(true);
                window.clearTimeout(hideTimer.current);
                hideTimer.current = window.setTimeout(() => setOpen(false), 1500);
              }, 500);
            }}
            onPointerUp={(e) => {
              onPointerUp?.(e);
              endPress();
            }}
            onPointerCancel={(e) => {
              onPointerCancel?.(e);
              endPress();
            }}
            onPointerLeave={(e) => {
              onPointerLeave?.(e);
              endPress();
            }}
            onClick={(e) => {
              // The release of a long press read the label; it is not a tap.
              if (labelShown.current) {
                labelShown.current = false;
                e.preventDefault();
                return;
              }
              onClick?.(e);
            }}
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
