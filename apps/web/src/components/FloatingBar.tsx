import type { ComponentProps, ReactNode } from "react";
import { cn } from "cn";
import { Button } from "./ui/button";
import { TEXT } from "../lib/text";
import { FLOATING_BAR_COLUMNS, FLOATING_BAR_ITEM, FLOATING_BAR_WIDTH } from "./floatingBarLook";

/** The one floating bar's capsule of glass (floatingBarLook says its
 *  width and items): glass only on what floats over the map
 *  (rules.md), the bar's own denser blur and fill (design/tokens.json
 *  material.bar-*), so the words read on the frost over a photo or the
 *  route. What a stock part hands the element it renders (FplTabBar's
 *  Toolbar: its role, its ref and the arrows' keys) goes on the capsule
 *  itself. 4 points round the items: 56 tall in all at the default size. */
export function FloatingBar({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      {...rest}
      data-floating-bar=""
      className={cn(
        "liquid-glass rounded-full p-1 [--glass-blur:var(--glass-bar-blur)] [--glass-fill:var(--glass-bar-fill)]",
        FLOATING_BAR_COLUMNS,
        FLOATING_BAR_WIDTH,
        className,
      )}
    />
  );
}

/** An item's face: its 24-point glyph, a badge over its corner, over its
 *  word on the tab bar's own type (iOS 26's tab bar: Caption 1, 12 on 16,
 *  regular), on one line. A step bigger in the same 48-point item (the
 *  owner, 2026-11-20: "Tab font/icon can be bigger but keeping the same tab
 *  bar size"; "Can the tabs icon be bigger", twice), then back a step (the
 *  owner, 2026-11-20: "I think the tab icons can be a bit smaller"): the
 *  glyph 24, over the footnote's 13 on a 16 line, within the item's 48,
 *  so the bar stays 56. */
export function FloatingBarFace({ icon, badge, label }: { icon: ReactNode; badge?: ReactNode; label: string }) {
  return (
    <>
      <span
        // Important, as the stock Button's own rule for a glyph with no size
        // of its own (16, `[&_svg:not([class*='size-'])]`) outranks a plain
        // descendant rule: every size set here read 16 on the phone.
        className="relative flex shrink-0 [&_svg]:size-(--size-glyph-bar)!"
      >
        {icon}
        {badge}
      </span>
      {/* 11 on 13, medium, as iOS 26's tab bar sets its words under a
          24-point glyph (size.glyph-bar): the glyph some 5 clear above
          and the words below in the item's 48, and set apart from the
          figure strip's 13-point names over the bar (the owner,
          2026-11-26, on the tabs' proportions), where they were the
          tab bar's Footnote role, 13 on 18 (TEXT.tabBar, which the
          phones still draw until they follow). The caption role's size,
          at a medium weight rather than its own bold. */}
      <span className={cn("font-medium whitespace-nowrap", TEXT.caption)}>{label}</span>
    </>
  );
}

/** One of FPL's actions in the bar (FplTabBar, and its ••• menu's
 *  trigger, ShareTrigger): the stock Button, no pane of its own, the
 *  bar's glass under it, its glyph and word in the tint. What a Toolbar
 *  button or a menu's trigger hands it (its ref, keys, aria-expanded)
 *  goes on it. */
export function FloatingBarButton({
  icon,
  badge,
  label,
  spoken,
  testId,
  className,
  ...button
}: {
  icon: ReactNode;
  badge?: ReactNode;
  label: string;
  /** The whole name, where a badge or a mark has more to say. */
  spoken?: string;
  testId: string;
} & Omit<ComponentProps<typeof Button>, "children" | "variant">) {
  return (
    <Button
      type="button"
      variant="ghost"
      {...button}
      data-testid={testId}
      aria-label={spoken}
      className={cn(FLOATING_BAR_ITEM, "text-tint hover:text-tint native:text-secondary-foreground", className)}
    >
      <FloatingBarFace icon={icon} badge={badge} label={label} />
    </Button>
  );
}

/** A count of findings over an icon's corner (FPL's Brief and Profile):
 *  red where one is a stop, amber where all are cautions, the one meaning
 *  of each colour wherever a badge is drawn (the owner's list, 2026-11-17).
 *  Its figure in the ground's colour, which reads on either -- dark on the
 *  night's light red and amber, light on the day's deep ones -- where white
 *  on the night's red and black on the day's amber did not. A plain count
 *  (an airport's charts, an airplane's flights) is no badge: it is said in
 *  the tab's name, and a black disc over a tab read as one more alert. */
export function TabCount({ count, testId, mark }: { count: number; testId?: string; mark: "stop" | "caution" }) {
  return (
    // The figure drawn from data-count, not a text node: the button's name
    // ("Brief, 3 findings to look at") says it, and axe's Label in Name
    // (WCAG 2.5.3) read the badge's "3" run into the word under it, "3Brief",
    // which no name can start with and still say what is in it.
    <span
      aria-hidden
      data-testid={testId}
      data-finding={mark}
      data-count={count}
      className={cn(
        "pointer-events-none absolute -top-2 left-full -ml-2 min-w-4 rounded-full px-1 text-center leading-4 font-semibold tabular-nums text-background after:content-[attr(data-count)]",
        mark === "stop" ? "bg-destructive" : "bg-caution",
        TEXT.caption,
      )}
    />
  );
}
