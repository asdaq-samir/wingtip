import { Fragment, useCallback, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { PullDownWords, type PullDownProps } from "../PullDown";

/** PullDown's menu, from the popups' chunk (popupsChunk). */
export function PullDownMenu<V extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  testId,
  align = "end",
  trigger,
  className,
  contentClassName,
  top,
  defaultOpen = false,
}: PullDownProps<V> & {
  /** Open as it is first drawn: tapped before the chunk was in. */
  defaultOpen?: boolean;
}) {
  // Open only while its trigger is in sight: the sheet it is on lowered
  // to the pill under an open menu left the menu over the tab bar, its
  // first choice alone above the screen's foot (the owner's screenshot,
  // 2026-10-27: Setup's Theme menu, "System", over the tabs). Base UI's
  // Positioner says when its anchor is hidden, the sheet's clip counted.
  const [open, setOpen] = useState(defaultOpen);
  const close = useCallback(() => setOpen(false), []);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          trigger ?? (
            <PullDownWords label={label} value={value} options={options} placeholder={placeholder} testId={testId} className={className} />
          )
        }
      />
      <DropdownMenuContent align={align} className={contentClassName} onAnchorHidden={close}>
        {top && (
          <>
            {top}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuRadioGroup value={value} onValueChange={(v: V) => onChange(v)} aria-label={label}>
          {options.map((o) => (
            <Fragment key={o.value}>
              <DropdownMenuRadioItem value={o.value} data-testid={o.testId} aria-label={o.text}>
                {o.label}
              </DropdownMenuRadioItem>
              {o.apart && <DropdownMenuSeparator />}
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
