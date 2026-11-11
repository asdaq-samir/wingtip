import * as React from "react";
import { cn } from "cn";
import { MENU_CHECK, MENU_CHECK_ITEM, MENU_CONTENT, MENU_ITEM, MENU_LABEL, MENU_SEPARATOR } from "./menuLook";
import { Menu as DropdownMenuPrimitive } from "@base-ui/react/menu";
import { CheckIcon, ChevronRightIcon } from "lucide-react";

function DropdownMenu({ ...props }: DropdownMenuPrimitive.Root.Props) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({ ...props }: DropdownMenuPrimitive.Portal.Props) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({ ...props }: DropdownMenuPrimitive.Trigger.Props) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

/** Calls `onHidden` as the menu's anchor goes out of sight: Base UI's
 *  hide middleware, the Positioner's anchorHidden (data-anchor-hidden),
 *  which counts a clipping ancestor (the sheet) as out of sight. */
function AnchorHidden({ hidden, onHidden }: { hidden: boolean; onHidden: () => void }) {
  React.useEffect(() => {
    if (hidden) onHidden();
  }, [hidden, onHidden]);
  return null;
}

function DropdownMenuContent({
  className,
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  collisionPadding,
  anchor,
  onAnchorHidden,
  ...props
}: DropdownMenuPrimitive.Popup.Props &
  Pick<DropdownMenuPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset" | "collisionPadding" | "anchor"> & {
    /** Its trigger out of sight while it is open. */
    onAnchorHidden?: () => void;
  }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        anchor={anchor}
        render={
          onAnchorHidden
            ? (props, state) => (
                <div {...props}>
                  {props.children}
                  <AnchorHidden hidden={state.anchorHidden} onHidden={onAnchorHidden} />
                </div>
              )
            : undefined
        }
      >
        <DropdownMenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            MENU_CONTENT,
            "z-50 max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto text-popover-foreground duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-closed:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </DropdownMenuPrimitive.Positioner>
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ ...props }: DropdownMenuPrimitive.Group.Props) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: DropdownMenuPrimitive.Item.Props & { inset?: boolean; variant?: "default" | "destructive" }) {
  return (
    // Each item 44 tall to a finger, as iOS's menus and the grouped lists'
    // rows are (GroupedList): the row is the control, its own height its
    // hit area. They were 31 to 34 (the commonality audit's C-2).
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        MENU_ITEM,
        "group/dropdown-menu-item data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:*:[svg]:text-destructive data-inset:pl-10",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  // A pick closes the menu, as iOS's menus and Radix's did; Base UI keeps
  // it open unless told. closeOnClick={false} where it should stay.
  closeOnClick = true,
  checked,
  inset,
  ...props
}: DropdownMenuPrimitive.CheckboxItem.Props & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      closeOnClick={closeOnClick}
      data-inset={inset}
      className={cn(MENU_CHECK_ITEM, className)}
      checked={checked}
      {...props}
    >
      <span className={MENU_CHECK} data-slot="dropdown-menu-checkbox-item-indicator">
        <DropdownMenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({ ...props }: DropdownMenuPrimitive.RadioGroup.Props) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function DropdownMenuRadioItem({
  className,
  children,
  // A pick closes the menu, as iOS's menus and Radix's did; Base UI keeps
  // it open unless told. closeOnClick={false} where it should stay.
  closeOnClick = true,
  inset,
  ...props
}: DropdownMenuPrimitive.RadioItem.Props & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      closeOnClick={closeOnClick}
      data-inset={inset}
      className={cn(MENU_CHECK_ITEM, className)}
      {...props}
    >
      <span className={MENU_CHECK} data-slot="dropdown-menu-radio-item-indicator">
        <DropdownMenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

/** A group's heading: inside a DropdownMenuGroup (or radio group), whose
 *  name it is, as Base UI asks. */
function DropdownMenuLabel({ className, inset, ...props }: DropdownMenuPrimitive.GroupLabel.Props & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(MENU_LABEL, "data-inset:pl-10", className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: DropdownMenuPrimitive.Separator.Props) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn(MENU_SEPARATOR, className)} {...props} />;
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn("ml-auto text-xs pointer-coarse:text-(length:--type-note) tracking-widest text-muted-foreground", className)}
      {...props}
    />
  );
}

function DropdownMenuSub({ ...props }: DropdownMenuPrimitive.SubmenuRoot.Props) {
  return <DropdownMenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: DropdownMenuPrimitive.SubmenuTrigger.Props & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(MENU_ITEM, "data-inset:pl-10 data-popup-open:bg-foreground/8", className)}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </DropdownMenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn("w-auto overflow-hidden", className)}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
