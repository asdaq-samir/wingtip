import { useEffect, useRef, useState, type ComponentProps } from "react";
import { mergeProps } from "react-aria/mergeProps";
import { useLongPress } from "react-aria/useLongPress";
import { cn } from "cn";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { EXPANDED_BUTTON } from "../expandedButton";

type Props = ComponentProps<typeof Button> & {
  /** Names the button once: the tooltip's text and the accessible name. */
  label: string;
};

/** IconButton with its tooltip, from the popups' chunk (popupsChunk). A
 *  finger has no hover: held, the button shows its label for a second and
 *  a half, as iOS shows a toolbar button's, by React Aria's stock long
 *  press (its half a second, and the release after it not a tap). */
export function IconTip({ label, variant = "ghost", size = "icon", className, children, onClick, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const labelShown = useRef(false);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);
  const { longPressProps } = useLongPress({
    pointerType: "touch",
    onLongPressStart: () => {
      labelShown.current = false;
    },
    onLongPress: () => {
      labelShown.current = true;
      setOpen(true);
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setOpen(false), 1500);
    },
  });
  // A finger's hold alone: usePress, under useLongPress, also takes Enter
  // and Space on the button (its keydown's default prevented, its press
  // never a click), so a keyboard could press no icon button at all -- a
  // card's ✕ among them (checkpoints.spec and flight-critical.spec's
  // closeNavLog on run 42843021881). The keys stay the button's own.
  const { onKeyDown: _keyDown, onKeyUp: _keyUp, ...holdProps } = longPressProps;
  return (
    // Base UI's own opening: after its hover delay, and on a keyboard's
    // focus, so a keyboard user learns what an icon does. The main sheet
    // and the cards no longer focus a first control as they open
    // (initialFocus false), which is why focus was once kept out.
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        render={
          <Button
            variant={variant}
            size={size}
            aria-label={label}
            className={cn(EXPANDED_BUTTON, className)}
            {...mergeProps(props, holdProps)}
            onClick={(e) => {
              // The release of a long press read the label; it is not a tap.
              if (labelShown.current) {
                labelShown.current = false;
                e.preventDefault();
                return;
              }
              onClick?.(e);
            }}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
