import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Button as ButtonPrimitive } from "@base-ui/react/button";

// The words at iOS's sizes on a touch screen -- 17 points on a button,
// 15 on a small one, 13 on the smallest -- and at 14 and 12 with a mouse
// (lib/text.ts); the button's height stays what it is either way.
// Every button but the filled and the red ones is drawn in the tint,
// as iOS draws what can be tapped (index.css): it was the text's own
// colour, and an outlined, grey or plain button read as words. In the
// Native look (native:) they are shadcn's stock words again: the
// foreground on an outlined or plain one, secondary-foreground on a grey.
/** The glass variant's classes, for a control that is not a Button but
 *  wears its look (a Toggle, a Select's trigger, a chip's own button). */
const GLASS_BUTTON =
  "border-0 bg-foreground/8 text-foreground shadow-none hover:bg-foreground/12 hover:text-foreground aria-expanded:bg-foreground/12";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm pointer-coarse:text-(length:--type-row) font-medium whitespace-nowrap transition-all outline-none select-none cursor-pointer focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px pointer-coarse:active:opacity-60 pointer-coarse:active:duration-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
        link: "text-tint underline-offset-4 hover:underline",
        // The app's own: a pane of the grey glass over the map and on the
        // sheet, as Maps' round buttons are on iOS 26 (GLASS_BUTTON, the
        // style audit of 2026-10-26) -- the text's colour at 8%, 12% under
        // a pointer or with its menu out, flat, its glyph in the text's
        // colour. Only theme tokens, so each look changes it there.
        glass: GLASS_BUTTON,
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
