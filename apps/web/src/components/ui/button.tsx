import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { TYPE_CLASS } from "../../lib/tokens";

// The words at iOS's sizes on a touch screen -- 17 points on a button,
// 15 on a small one, 13 on the smallest -- and at 14 and 12 with a mouse
// (lib/text.ts); the button's height stays what it is either way.
// Every button but the filled and the red ones is drawn in the tint,
// as iOS draws what can be tapped (index.css): it was the text's own
// colour, and an outlined, grey or plain button read as words. In the
// Native look (native:) they are shadcn's stock words again: the
// foreground on an outlined or plain one, secondary-foreground on a grey.
/** The glass variant's classes: the Button's here and the Toggle's
 *  (toggle.tsx, so a ToggleGroupItem's too), and nowhere else -- a
 *  control in the glass is one of the two in that variant. */
const GLASS_BUTTON =
  "border-0 bg-foreground/8 text-foreground shadow-none hover:bg-foreground/12 hover:text-foreground aria-expanded:bg-foreground/12";

// Its transition names what eases (colours, ring, the press's dim and 1 px
// give), not shadcn's transition-all: under `all` a size, a padding or
// `visibility` set from a class eased too, so a figure's type trailed the
// sheet and a hidden ••• lingered over the pill for 150 ms (the design
// review of 2026-11-23, H1; web.md "never transition: all").
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm pointer-coarse:text-(length:--type-row) font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity,translate] outline-none select-none cursor-pointer focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px pointer-coarse:active:opacity-60 pointer-coarse:active:duration-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Disabled: muted rather than half transparent, which left the
        // label at 1.92:1 -- still plainly inert, and readable.
        default:
          "bg-primary text-primary-foreground hover:bg-primary/80 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
        outline:
          "border-border bg-background text-tint shadow-xs hover:bg-muted aria-expanded:bg-muted dark:border-input dark:bg-input/30 dark:hover:bg-input/50 native:text-foreground",
        secondary:
          "bg-secondary text-tint native:text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary",
        ghost: "text-tint hover:bg-muted aria-expanded:bg-muted dark:hover:bg-muted/50 native:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive-ink hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive dark:bg-destructive/10 dark:hover:bg-destructive/20 dark:focus-visible:ring-destructive",
        // The app's own: a ghost button that is a row or a label, no tint
        // and no hover fill of its own (the caller sets its text and look),
        // left-aligned. Ghost's expanded, dark-hover and native states stay.
        plain: "justify-start text-inherit hover:bg-transparent aria-expanded:bg-muted dark:hover:bg-muted/50 native:text-foreground",
        link: "text-tint underline-offset-4 hover:underline",
        // The app's own: a pane of the grey glass over the map and on the
        // sheet, as Maps' round buttons are on iOS 26 (GLASS_BUTTON, the
        // style audit of 2026-10-26) -- the text's colour at 8%, 12% under
        // a pointer or with its menu out, flat, its glyph in the text's
        // colour. Only theme tokens, so each look changes it there.
        glass: GLASS_BUTTON,
        // The app's own: words in the tint on the tint's light wash, as
        // iOS draws a tinted capsule (the fuel stops' pill), a step more
        // of the wash under a pointer or with its menu out; the press is
        // the stock dim and give. The round Toggle's `tint` off (toggle.tsx).
        tint: "bg-tint/12 text-tint hover:bg-tint/20 aria-expanded:bg-tint/20",
      },
      size: {
        default:
          "h-9 gap-1.5 px-2.5 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),8px)] px-2 text-xs pointer-coarse:text-(length:--type-note) in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-[min(var(--radius-md),10px)] px-2.5 pointer-coarse:text-(length:--type-detail) in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        lg: "h-10 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-9",
        "icon-xs": "size-6 rounded-[min(var(--radius-md),8px)] in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-md",
        "icon-lg": "size-10",
        // The round glass buttons (IconButton's `round`): 44 points, as
        // iOS 26's glass buttons in a sheet's head are (size.round-button,
        // rem: it grows with the head's words).
        "icon-round": "size-(--size-round-button)",
        // The app's own: a capsule of words in a row (the fuel stops' pill,
        // the procedures' "+ APCH"), as tall as the round Toggle beside it
        // (size.chip, 32 points), the stock padding and a detail's type,
        // its 44-point area a pseudo-element six points round it (hit-1.5),
        // so the capsule is not grown to make it.
        chip: cn("relative h-(--size-chip) gap-1 rounded-full px-2.5 hit-1.5", TYPE_CLASS.detail),
        // The app's own: words in a line of words, tapped as a link is (a
        // strip's "Show my position", a figure that opens its sheet) -- no
        // height, padding, gap or edge of its own, the text's size and
        // weight where it sits (a TEXT size or font-semibold beside it says
        // otherwise), wrapping and shrinking as words do. With the link
        // variant: the tint, and the stock focus ring.
        inline:
          "h-auto rounded-sm border-0 p-0 text-[length:inherit] pointer-coarse:text-[length:inherit] font-[weight:inherit] whitespace-normal shrink",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

// Base UI's Button: another element in its place through `render` (a link
// with `nativeButton={false}`), where Radix's Slot took `asChild`.
function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants, GLASS_BUTTON };
