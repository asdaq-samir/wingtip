import { createContext, useContext, useState, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";
import type { PopoverContent, PopoverTrigger } from "./ui/popover";
import { loadPopups, usePopups } from "./popupsChunk";
import { useIsMobile } from "../hooks/use-mobile";
import { SheetCard } from "./SheetCard";
import { TEXT } from "../lib/text";
import type { PanelState } from "../lib/mapChrome";

/**
 * A popover from `md` up and, on a phone, a card in the map's panel
 * (SheetCard), behind Popover's own API. A panel that fits beside its
 * button stays a popover; on a phone it was a sheet of its own floating
 * over the panel -- the map's settings, the approaches, the fuel's
 * breakdown, an airplane's form -- and is a card in the panel now, as
 * Maps opens everything in its one sheet, at the owner's ask ("let's have
 * consistency and common code", 2026-10-27): a card half way up at the
 * least, its close going back to what was there.
 */
type OnPhoneCard = {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The control that opens it, for the focus to go back to. */
  setTrigger: (node: HTMLElement | null) => void;
  trigger: () => HTMLElement | null;
  /** The size its card opens at, where the caller says (SheetCard's `opens`). */
  opens?: PanelState;
};

/** The card's open state on a phone; from `md` up, none (Base UI's). */
const OnPhone = createContext<OnPhoneCard | null>(null);

/** From `md` up: the popover's parts, on the popups' chunk (popupsChunk);
 *  until that is in, none, and a tap on the trigger asks for it and opens
 *  the popover once it is. */
const Desk = createContext<{ popups: ReturnType<typeof usePopups>; ask: () => void } | null>(null);

/** What the popover is placed against where that is not its trigger
 *  (ResponsivePopoverAnchor): Base UI's Positioner takes it as `anchor`,
 *  where Radix had an Anchor part. */
const Anchor = createContext<{ el: HTMLElement | null; set: (el: HTMLElement | null) => void } | null>(null);

/** Why it is closing, from `md` up: Base UI's, which a caller can cancel
 *  (a press on a row that switches the form, a focus moved by a menu just
 *  closed); on a phone, where only its close shuts it, none. */
type CloseDetails = PopoverPrimitive.Root.ChangeEventDetails;

export function ResponsivePopover({
  children,
  open,
  onOpenChange,
  phoneOpens,
}: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean, details?: CloseDetails) => void;
  /** On a phone, the size its card opens at whatever it covers (the
   *  procedures' at half, the map in sight over them); else as high as
   *  what it covers, half at the least. A search in it keeps the sheet's
   *  size, the keyboard placed by the Drawer (the owner, 2026-11-11). */
  phoneOpens?: PanelState;
}) {
  const isMobile = useIsMobile();
  // Open as the caller says where it says (`open`), else its own, as
  // Base UI's are.
  const [own, setOwn] = useState(false);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const popups = usePopups();
  const [asked, setAsked] = useState(false);
  if (!isMobile) {
    const placed = <Anchor.Provider value={{ el: anchor, set: setAnchor }}>{children}</Anchor.Provider>;
    if (!popups) {
      const ask = () => {
        setAsked(true);
        onOpenChange?.(true);
        void loadPopups();
      };
      return <Desk.Provider value={{ popups, ask }}>{placed}</Desk.Provider>;
    }
    return (
      <popups.Popover open={open} defaultOpen={asked} onOpenChange={onOpenChange}>
        <Desk.Provider value={{ popups, ask: () => {} }}>{placed}</Desk.Provider>
      </popups.Popover>
    );
  }
  const phone: OnPhoneCard = {
    open: open ?? own,
    setOpen: (next) => {
      setOwn(next);
      onOpenChange?.(next);
    },
    setTrigger,
    trigger: () => trigger,
    opens: phoneOpens,
  };
  return <OnPhone.Provider value={phone}>{children}</OnPhone.Provider>;
}

/** Its button: `asChild` makes the one child the button (Base UI's
 *  `render`), as it did under Radix. */
export function ResponsivePopoverTrigger({
  asChild,
  children,
  onClick,
  ...props
}: Omit<ComponentProps<typeof PopoverTrigger>, "render"> & { asChild?: boolean; children?: ReactNode }) {
  const phone = useContext(OnPhone);
  const desk = useContext(Desk);
  // A plain button: the phone's, which opens its card, or, from `md` up,
  // one standing in for the popover's until its chunk is in.
  const own = phone
    ? { open: phone.open, toggle: () => phone.setOpen(!phone.open), ref: phone.setTrigger }
    : desk && !desk.popups
      ? { open: false, toggle: desk.ask, ref: undefined }
      : null;
  const child = asChild ? (children as ReactElement<Record<string, unknown>>) : undefined;
  const element = useRender({
    enabled: !!own,
    defaultTagName: "button",
    render: child,
    ref: own?.ref,
    props: mergeProps<"button">(
      { type: asChild ? undefined : "button", "aria-expanded": own?.open, children: asChild ? undefined : children },
      // As Base UI's trigger marks itself while its popover is open.
      { "data-popup-open": own?.open ? "" : undefined } as ComponentProps<"button">,
      // Base UI's own, which the phone's plain button has no use for.
      (({ nativeButton: _native, ...rest }) => rest)(props) as ComponentProps<"button">,
      {
        // The caller's first, which can keep it shut (preventDefault).
        onClick: (event) => {
          onClick?.(event as Parameters<NonNullable<typeof onClick>>[0]);
          if (own && !event.defaultPrevented) own.toggle();
        },
      },
    ),
  });
  if (!own && desk?.popups)
    return (
      <desk.popups.PopoverTrigger render={child} onClick={onClick} {...props}>
        {asChild ? undefined : children}
      </desk.popups.PopoverTrigger>
    );
  return element;
}

/** What the popover is placed against, where a trigger cannot be (a mark
 *  inside another button, the logbook's): its one child, measured for the
 *  popover's place. A phone's card needs none. */
export function ResponsivePopoverAnchor({ children }: { asChild?: boolean; children: ReactElement }) {
  const anchor = useContext(Anchor);
  return useRender({ render: children, ref: anchor?.set });
}

type ContentProps = ComponentProps<typeof PopoverContent> & {
  /** The card's name on a phone -- and its accessible name either way. */
  title: string;
  /** Shown under the name on a phone; the popover has room for neither. */
  description?: string;
  /** For a panel whose content opens with its own field and close (the
   *  airport search's): the card's name is then for the screen reader only. */
  titleHidden?: boolean;
  /** A control at the top, at the end of the name's row (a form's Save, a
   *  Done, a close of its own that goes back a page first): given one, the
   *  popover shows its title too. */
  action?: ReactNode;
  /** A control at the start of the name's row -- a form's Cancel, as an
   *  iOS sheet puts it -- and then the name sits between the two. No
   *  Back: the close goes back, at the owner's ask ("remove the back
   *  buttons, because close button should behave as the back button",
   *  2026-10-22). */
  leading?: ReactNode;
  /** On a phone, the app's close (CloseButton) at the name row's end where
   *  nothing else is there (`action`, `leading`). False where the card's
   *  own Done is it. */
  closeButton?: boolean;
};

export function ResponsivePopoverContent({
  title,
  description,
  titleHidden,
  action,
  leading,
  className,
  closeButton,
  children,
  align,
  side,
  sideOffset,
  alignOffset,
  collisionPadding,
  ...props
}: ContentProps) {
  const phone = useContext(OnPhone);
  const desk = useContext(Desk);
  const anchor = useContext(Anchor);
  if (!phone) {
    if (!desk?.popups) return null;
    return (
      <desk.popups.PopoverContent
        anchor={anchor?.el ?? undefined}
        // Eight off its trigger, past the trigger's hit area (index.css),
        // where the stock four laid the popover over it.
        aria-label={title}
        className={className}
        align={align}
        side={side}
        sideOffset={sideOffset ?? 8}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
        {...props}
      >
        {action !== undefined && (
          <div className="flex min-h-8 items-center justify-between gap-2">
            {leading}
            {/* A heading, as the phone's card's name is, so a page pushed
                in the popover (the Procedures') is named alike on both. */}
            <div role="heading" aria-level={2} className={cn("font-semibold", TEXT.row, leading && "flex-1 text-center")}>
              {title}
            </div>
            {action}
          </div>
        )}
        {children}
      </desk.popups.PopoverContent>
    );
  }
  if (!phone.open) return null;
  // The popover's own sizes and placement are left behind: the card is the
  // panel's width, and no modal (nothing outside it to dismiss it on).
  const { initialFocus, finalFocus, "data-testid": testId } = props as typeof props & { "data-testid"?: string };
  return (
    <SheetCard
      title={title}
      titleHidden={titleHidden}
      description={description}
      leading={leading}
      action={action}
      closeButton={closeButton}
      onClose={() => phone.setOpen(false)}
      opens={phone.opens}
      testId={testId}
      returnFocus={phone.trigger}
      initialFocus={initialFocus}
      finalFocus={finalFocus}
    >
      {children}
    </SheetCard>
  );
}
