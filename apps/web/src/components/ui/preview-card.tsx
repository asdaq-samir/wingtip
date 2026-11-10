import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import { cn } from "cn";
import { MENU_CONTENT } from "./menuLook";

/**
 * shadcn's Hover Card on Base UI's Preview Card: a card of what a link or
 * a row leads to, shown while a pointer rests on it. For pointer devices
 * only (usePointerHover): a finger's tap is the row's own.
 */
function PreviewCard(props: PreviewCardPrimitive.Root.Props) {
  return <PreviewCardPrimitive.Root data-slot="preview-card" {...props} />;
}

function PreviewCardTrigger(props: PreviewCardPrimitive.Trigger.Props) {
  return <PreviewCardPrimitive.Trigger data-slot="preview-card-trigger" {...props} />;
}

function PreviewCardContent({
  className,
  side = "right",
  sideOffset = 8,
  align = "start",
  anchor,
  ...props
}: PreviewCardPrimitive.Popup.Props & Pick<PreviewCardPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "anchor">) {
  return (
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner className="isolate z-50" side={side} sideOffset={sideOffset} align={align} anchor={anchor}>
        <PreviewCardPrimitive.Popup
          data-slot="preview-card-content"
          className={cn(
            MENU_CONTENT,
            "w-72 origin-(--transform-origin) p-3 text-popover-foreground outline-none data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0",
            className,
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}

export { PreviewCard, PreviewCardContent, PreviewCardTrigger };
