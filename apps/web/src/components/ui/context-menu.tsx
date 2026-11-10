import * as React from "react";
import { cn } from "cn";
import { MENU_CHECK, MENU_CHECK_ITEM, MENU_CONTENT, MENU_ITEM, MENU_LABEL, MENU_SEPARATOR } from "./menuLook";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { ChevronRightIcon, CheckIcon } from "lucide-react";

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuTrigger({ className, ...props }: ContextMenuPrimitive.Trigger.Props) {
  return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" className={cn("select-none", className)} {...props} />;
}

function ContextMenuGroup({ ...props }: ContextMenuPrimitive.Group.Props) {
  return <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />;
}

function ContextMenuPortal({ ...props }: ContextMenuPrimitive.Portal.Props) {
  return <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />;
}

function ContextMenuSub({ ...props }: ContextMenuPrimitive.SubmenuRoot.Props) {
  return <ContextMenuPrimitive.SubmenuRoot data-slot="context-menu-sub" {...props} />;
}

function ContextMenuRadioGroup({ ...props }: ContextMenuPrimitive.RadioGroup.Props) {
  return <ContextMenuPrimitive.RadioGroup data-slot="context-menu-radio-group" {...props} />;
}

function ContextMenuContent({
  className,
  align = "start",
  alignOffset = 4,
  side = "right",
  sideOffset = 0,
  ...props
}: ContextMenuPrimitive.Popup.Props & Pick<ContextMenuPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          // Eight under the pointer (mt-2): the menu's rows run edge to
          // edge (menuLook), so at the pointer itself the first row took
          // the right button's own release as a pick -- a held row's
          // Delete fired as the menu opened (under Radix).
          className={cn(
            MENU_CONTENT,
            "mt-2 z-50 max-h-(--available-height) origin-(--transform-origin) overflow-x-hidden overflow-y-auto text-popover-foreground duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: ContextMenuPrimitive.Item.Props & { inset?: boolean; variant?: "default" | "destructive" }) {
  return (
    // 44 tall to a finger, and the menus' 17-point words, as the dropdown
    // menu's items are: a held Recent's Delete was 31 tall with 14-point
    // words beside the Share menu's 34 and 17.
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        MENU_ITEM,
        "group/context-menu-item data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:*:[svg]:text-destructive data-inset:pl-10",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuSubTrigger({ className, inset, children, ...props }: ContextMenuPrimitive.SubmenuTrigger.Props & { inset?: boolean }) {
  return (
    <ContextMenuPrimitive.SubmenuTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(MENU_ITEM, "data-inset:pl-10 data-popup-open:bg-foreground/8", className)}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </ContextMenuPrimitive.SubmenuTrigger>
  );
}

function ContextMenuSubContent({ className, ...props }: React.ComponentProps<typeof ContextMenuContent>) {
  return (
    <ContextMenuContent data-slot="context-menu-sub-content" className={cn("mt-0 overflow-hidden", className)} side="right" {...props} />
  );
}

function ContextMenuCheckboxItem({
  className,
  children,
  // A pick closes the menu, as iOS's menus and Radix's did; Base UI keeps
  // it open unless told. closeOnClick={false} where it should stay.
  closeOnClick = true,
  checked,
  inset,
  ...props
}: ContextMenuPrimitive.CheckboxItem.Props & { inset?: boolean }) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      closeOnClick={closeOnClick}
      data-inset={inset}
      className={cn(MENU_CHECK_ITEM, className)}
      checked={checked}
      {...props}
    >
      <span className={MENU_CHECK}>
        <ContextMenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </ContextMenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
}

function ContextMenuRadioItem({
  className,
  children,
  // A pick closes the menu, as iOS's menus and Radix's did; Base UI keeps
  // it open unless told. closeOnClick={false} where it should stay.
  closeOnClick = true,
  inset,
  ...props
}: ContextMenuPrimitive.RadioItem.Props & { inset?: boolean }) {
  return (
    <ContextMenuPrimitive.RadioItem
      data-slot="context-menu-radio-item"
      closeOnClick={closeOnClick}
      data-inset={inset}
      className={cn(MENU_CHECK_ITEM, className)}
      {...props}
    >
      <span className={MENU_CHECK}>
        <ContextMenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </ContextMenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  );
}

/** A group's heading: inside a ContextMenuGroup, as Base UI asks. */
function ContextMenuLabel({ className, inset, ...props }: ContextMenuPrimitive.GroupLabel.Props & { inset?: boolean }) {
  return (
    <ContextMenuPrimitive.GroupLabel
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(MENU_LABEL, "data-inset:pl-10", className)}
      {...props}
    />
  );
}

function ContextMenuSeparator({ className, ...props }: ContextMenuPrimitive.Separator.Props) {
  return <ContextMenuPrimitive.Separator data-slot="context-menu-separator" className={cn(MENU_SEPARATOR, className)} {...props} />;
}

function ContextMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn("ml-auto text-xs pointer-coarse:text-(length:--type-note) tracking-widest text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};
