import type { ComponentProps } from "react";
import { Ellipsis, Share } from "lucide-react";
import IconButton from "../../components/IconButton";
import { CardAction } from "../../components/CardAction";
import { FloatingBarButton } from "../../components/FloatingBar";
import type { RouteCard } from "../../lib/openCards";

const SHARE_LABEL: Record<"route" | RouteCard, string> = {
  // The route box's is More, a "…", at the owner's ask ("Don't call it
  // share, call it more with the … as the text"): it holds the route's
  // other actions (save, file, plan again, clear), not sharing alone.
  route: "More",
  brief: "Share the briefing",
  navlog: "Share the nav log",
  profile: "Share the profile",
};

/** Plan again due: a dot on the glyph, said in the button's name. */
function StaleMark({ stale }: { stale: string[] }) {
  return stale.length ? (
    <span aria-hidden="true" data-testid="plan-again-mark" className="absolute -top-0.5 -right-1 size-2 rounded-full bg-caution" />
  ) : null;
}

/** ShareMenu's trigger: the route's ••• as a button of FPL's floating bar
 *  ("bar", FplTabBar) or of the flying drawer's tiles ("tile", FplActions),
 *  its glyph over "More" (the owner, 2026-11-17: "move everything to the
 *  tab bar with a ... instead of share"); else a round button, the first
 *  row's ••• before there is a route or a card's Share. */
export function TriggerButton({
  look,
  card,
  stale,
  testId,
  ...trigger
}: { look?: "bar" | "tile"; card: "route" | RouteCard; stale: string[]; testId: string } & Omit<
  ComponentProps<"button">,
  "children" | "onClick" | "disabled"
>) {
  // In FPL's floating bar, one of its items (FloatingBar).
  if (look === "bar")
    return (
      <FloatingBarButton
        icon={<Ellipsis />}
        badge={<StaleMark stale={stale} />}
        label={SHARE_LABEL.route}
        spoken={stale.length ? `More: ${stale.join(", ")}` : undefined}
        testId={testId}
        {...trigger}
      />
    );
  if (look)
    return (
      <CardAction
        icon={
          <span className="relative flex">
            <Ellipsis />
            <StaleMark stale={stale} />
          </span>
        }
        label={SHARE_LABEL.route}
        spoken={stale.length ? `More: ${stale.join(", ")}` : undefined}
        testId={testId}
        {...trigger}
      />
    );
  // FPL's ••• a plain glyph in the tint, as the search bar's microphone is
  // in its twin of a bar: one look for a button in the first row (the
  // owner's list, 2026-11-17), where it was a grey disc with a black glyph
  // beside the tinted toggle.
  return (
    <IconButton
      round
      label={stale.length ? `${SHARE_LABEL[card]}: ${stale.join(", ")}` : SHARE_LABEL[card]}
      {...(card === "route" ? { variant: "ghost" as const, className: "size-[32px]" } : {})}
      data-testid={testId}
      {...trigger}
    />
  );
}

/** The round button's glyph: the route's ••• a size down, as the first
 *  row's other buttons are; a card's Share. */
export function TriggerFace({ card, stale }: { card: "route" | RouteCard; stale: string[] }) {
  return (
    <span className="relative">
      {card === "route" ? <Ellipsis className="size-[18px]" strokeWidth={2.4} /> : <Share className="size-5" strokeWidth={2} />}
      <StaleMark stale={stale} />
    </span>
  );
}
