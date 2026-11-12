import { useState } from "react";
import { MapPin, Plane } from "lucide-react";
import { cn } from "cn";
import CloseButton from "../../../components/CloseButton";
import AirportField from "../../../components/AirportField";
import { Button } from "../../../components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../../components/ui/card";
import { TEXT } from "../../../lib/text";
import type { RecentAirport } from "../../../lib/preferences";
import { useFirstFlight } from "../hooks/useFirstFlight";
import { OnSheetTop } from "../../../components/sheet/sheetTop";
import type { RouteParts } from "./RouteBox";

/**
 * "Your first flight": a card over the map, above the sheet's pill, the
 * first time the planner opens with no route on this device (the owner's
 * canvas, 2026-11-03; useFirstFlight): one line of what Wingtip does, a
 * destination field with the airport search the route's box and the
 * search bar use (useAirportSearch, through PanelCapsule's field and
 * results), Plan it, and the three steps under it -- Route, Nav log,
 * Brief. Planned, the card is gone for good and the nav log opens. Where
 * the app has no
 * position and no last departure, a second field asks where from.
 */
/** The map's buttons riding the sheet's top with the card stand over it,
 *  not on it (the sheet audit, 2026-11-12: the radio's, the Map and the
 *  position buttons sat over Plan it): the card's height on the riding
 *  container they share (OnSheetTop), for their place (MapControls). */
function liftRiders(card: HTMLDivElement | null) {
  const slot = card?.parentElement;
  if (!card || !slot) return;
  const lift = () => slot.style.setProperty("--sheet-top-lift", `${card.offsetHeight}px`);
  const watch = new ResizeObserver(lift);
  watch.observe(card);
  lift();
  return () => {
    watch.disconnect();
    slot.style.removeProperty("--sheet-top-lift");
  };
}

export default function FirstFlight({
  routed,
  onPlan,
  onPlanned,
}: {
  routed: boolean;
  onPlan: (parts: RouteParts) => void;
  onPlanned: () => void;
}) {
  const { shown, needsFrom, planning, problem, planIt, dismiss } = useFirstFlight({ routed, onPlan, onPlanned });
  const [dest, setDest] = useState<RecentAirport | null>(null);
  const [from, setFrom] = useState<RecentAirport | null>(null);
  if (!shown) return null;
  const ready = !!dest && (!needsFrom || !!from);
  return (
    // On a phone's bottom sheet's top, riding it (OnSheetTop); else over
    // the map, up from the sheet's pill (--map-inset-bottom, as the map's
    // buttons stand off it), in from the screen's sides as the sheet is;
    // one column on a phone, the sheet's width beside it.
    <OnSheetTop>
      {(riding) => (
        // The stock Card, its parts as they come, in the map's glass (or
        // solid, in the solid looks) and the card's own corners; its
        // spacing the card's 16 rather than the stock 24, as the phone's
        // other cards are.
        <Card
          ref={riding ? liftRiders : undefined}
          role="region"
          aria-labelledby="first-flight-title"
          data-testid="first-flight"
          className={cn(
            "absolute right-3 z-[1000] mx-auto max-w-md gap-3 rounded-(--radius-card) border-0 bg-card/95 py-4 shadow-overlay backdrop-blur-xl solid:bg-card solid:backdrop-blur-none",
            riding
              ? "pointer-events-auto bottom-3 left-3"
              : "bottom-[calc(max(env(safe-area-inset-bottom),var(--map-inset-bottom,0px))+0.75rem)] left-[calc(0.75rem+var(--map-inset-left,0px))]",
          )}
        >
          <CardHeader className="px-4">
            <CardTitle role="heading" aria-level={2} id="first-flight-title" className={cn("flex items-center gap-2.5", TEXT.heading)}>
              <Plane className="size-6 shrink-0 text-tint" aria-hidden />
              Your first flight
            </CardTitle>
            <CardAction className="-my-1 -mr-1">
              <CloseButton label="Not now" onClick={dismiss} data-testid="first-flight-close" />
            </CardAction>
            <CardDescription className={cn("text-foreground/80", TEXT.prose)}>
              Where to? Wingtip plans from where you are: the route, the checkpoints you'll see from the air, the nav log and a weather
              brief.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-4">
            <AirportField
              label="Destination"
              placeholder="Airport, town or ident"
              picked={dest}
              onPick={setDest}
              testId="first-flight-dest"
            />
            {needsFrom && (
              <AirportField
                label="From"
                placeholder="Where you take off"
                icon={MapPin}
                picked={from}
                onPick={setFrom}
                testId="first-flight-from"
              />
            )}
            {problem && (
              <p role="alert" className={cn("text-destructive", TEXT.detail)} data-testid="first-flight-problem">
                {problem}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3 px-4">
            <Button
              type="button"
              size="lg"
              className="h-12 rounded-(--radius-control) font-semibold"
              disabled={!ready || planning}
              onClick={() => {
                if (dest) void planIt(dest.ident, from?.ident ?? null);
              }}
              data-testid="first-flight-plan"
            >
              {planning ? "Planning…" : "Plan it"}
            </Button>
            <ol className={cn("flex flex-wrap gap-x-2 text-muted-foreground", TEXT.note)} aria-label="The three steps">
              <li>
                <span className="font-semibold text-foreground">Step 1 of 3 · Route</span>
              </li>
              <li aria-hidden>·</li>
              <li>Nav log</li>
              <li aria-hidden>·</li>
              <li>Brief</li>
            </ol>
          </CardFooter>
        </Card>
      )}
    </OnSheetTop>
  );
}
