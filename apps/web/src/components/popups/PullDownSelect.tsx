import { Fragment, useCallback, useState } from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "cn";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "../ui/select";
import type { PullDownProps } from "../PullDown";
import { PULL_DOWN_WORDS, pullDownName } from "../ui/menuLook";

/** The stock trigger's field look put away for the tinted words: no
 *  height, padding, line or fill of its own, the value cut short. */
const AS_WORDS =
  "h-auto data-[size=default]:h-auto justify-start border-0 bg-transparent p-0 shadow-none dark:bg-transparent dark:hover:bg-transparent [&_svg:not([class*='size-'])]:size-4 *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate";

/** PullDown's Select, from the popups' chunk (popupsChunk). */
export function PullDownSelect<V extends string>({
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
    <Select<V>
      value={value === "" ? null : value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      // Each choice's words for the trigger's Select.Value.
      items={options.map((o) => ({ value: o.value, label: o.label }))}
      open={open}
      onOpenChange={setOpen}
    >
      {trigger ? (
        <SelectPrimitive.Trigger render={trigger} />
      ) : (
        <SelectTrigger
          aria-label={pullDownName({ label, value, options, placeholder })}
          data-testid={testId}
          className={cn(PULL_DOWN_WORDS, AS_WORDS, className)}
        >
          <SelectValue placeholder={placeholder} className="flex-none gap-1.5 data-placeholder:text-muted-foreground" />
        </SelectTrigger>
      )}
      {/* Base UI's own placing, over the trigger with the picked row on it
          from a mouse, beside it (`align`) from a finger. */}
      <SelectContent align={align} className={contentClassName} onAnchorHidden={close} aria-label={label}>
        {options.map((o) => (
          <Fragment key={o.value}>
            <SelectItem value={o.value} data-testid={o.testId} aria-label={o.text}>
              {o.label}
            </SelectItem>
            {o.apart && <SelectSeparator />}
          </Fragment>
        ))}
      </SelectContent>
    </Select>
  );
}
