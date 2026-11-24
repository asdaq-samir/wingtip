import { useAirplaneChosen } from "../../lib/preferences";
import { Route, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { TEXT } from "../../lib/text";
import { gal, wholeNm } from "../../lib/format";

/** FPL's route line's choices (PlanWorkspace's routeLine): each chip's
 *  key and words, and what its way meets; the one picked. */
export interface RouteLineChoices {
  /** Each way: its key, name, what it meets, its whole time ("2h 59m"),
   *  and its miles and fuel. */
  chips: { key: string; label: string; warning: string | null; time: string | null; nm: number | null; gal: number | null }[];
  picked: string;
  onPick: (key: string) => void;
  /** The ways are the last airplane's or time's while the new ones come
   *  (useRouteWays): the row kept in its place, dimmed, its cards not to be
   *  picked till they are this airplane's. */
  stale?: boolean;
}

/**
 * FPL's Routes, over the route's fields: one row of chips, each a way's
 * name and its whole time, the one flown filled, a tap on one the route at
 * once ("As typed" is the route as typed, the owner's word for what was
 * "None", 2026-11-08); a swipe for more. It was a folding box of cards,
 * each its time over its name and its miles and fuel, which at half a
 * sheet took the rest of it, the cards cut off, and said a fuel unlike
 * the strip's (the owner's pick of the routes canvas, board 5, 2026-11-16,
 * Hr6eKFhyFBLjAAAmEaq8HB): the miles and fuel of the way flown are the
 * figures' at the sheet's foot, each way's said in its chip's name to a
 * screen reader. A way that meets something says so by its warning mark
 * alone, in amber, every chip's words one look (the owner's list,
 * 2026-11-17, where the name went amber too): the planner warns, never
 * refuses. What the planner could not check
 * the ways for is not said under them (the owner, 2026-11-16: "Why am I
 * seeing the not checked line?", then "Ok"): a weather source down is the
 * Brief's to say, counted on FPL's Brief button, and an airplane's figure
 * missing its fuel breakdown's, which asks for it.
 */
/** A way's miles and fuel, "105 nm, 10.3 gal", as far as they are known. */
const figures = (c: RouteLineChoices["chips"][number]) =>
  [c.nm != null ? wholeNm(c.nm) : null, c.gal != null ? gal(c.gal) : null].filter(Boolean).join(", ");

/** A way's name on its chip: the planner's first kind, and how many more
 *  it is the best of ("Avoid Weather +2"), where "Avoid Weather & Fastest &
 *  Over Land" ran off the row (the UI audit's C7, 2026-11-17). Its name in
 *  full is its chip's name to a screen reader and on its line's callout. */
function shortLabel(label: string): string {
  const kinds = label.split(" & ");
  return kinds.length > 1 ? `${kinds[0]} +${kinds.length - 1}` : label;
}

/** What the chip says of its way after its name: its time where an
 *  airplane gives one, else its miles, which need none -- each chip said
 *  something of its way, where with no airplane it said nothing. */
function chipFigure(c: RouteLineChoices["chips"][number]): string | null {
  return c.time ?? (c.nm != null ? wholeNm(c.nm) : null);
}

export function RouteLine({ line: asked, grouped = false }: { line: RouteLineChoices; grouped?: boolean }) {
  // No airplane picked: each way's miles, not its time or fuel, which are
  // an airplane's (the owner, 2026-11-08: "don't assume").
  const airplane = useAirplaneChosen();
  const line = airplane ? asked : { ...asked, chips: asked.chips.map((c) => ({ ...c, time: null, gal: null })) };
  const words = (c: RouteLineChoices["chips"][number]) =>
    `${c.key === "none" ? "As typed, the route as typed" : c.label}${c.time ? `, ${c.time}` : ""}${figures(c) ? `, ${figures(c)}` : ""}${c.warning ? `, ${c.warning.toLowerCase()}` : ""}`;
  return (
    <div
      className={cn(!grouped && "mt-2 mb-1", line.stale && "opacity-50 transition-opacity motion-reduce:transition-none")}
      data-testid="route-line"
      data-stale={line.stale ? "" : undefined}
      aria-busy={line.stale || undefined}
    >
      <ToggleGroup
        value={[line.picked]}
        onValueChange={(v) => {
          if (v[0]) line.onPick(v[0]);
        }}
        aria-label="Routes"
        disabled={line.stale}
        // Room above and under for the chips' 44-point areas, which a
        // scrolling row would cut off. In the foot bar (`grouped`) that
        // room is laid over the strip's: the row's 44 laid out at the thin
        // strip's 28 (PIN_FIGURE's two lines, 1.75rem), so Routes swapping
        // the figures for the chips moves neither the bar nor the map's
        // room (the r10 audit). There the row is only as wide as its chips
        // (w-fit), so the room after the last chip passes to the sheet
        // behind the bar, as the figures do (sheet/FootBar; the r10 audit's
        // W-L1). The row itself takes touches, where it took none and only
        // its chips did: iPhone's Safari would not scroll a row that takes
        // no touch, and a sideways swipe on the chips did nothing (the
        // owner, 2026-11-23: "Not able to slide the routes"). A sideways
        // swipe is the row's, not the sheet's (swipe-ignore "x", as the
        // route box's pills); an upward drag still opens the sheet.
        data-base-ui-swipe-ignore={grouped ? "x" : undefined}
        className={cn(
          "flex justify-start gap-2 overflow-x-auto overscroll-x-contain py-1.5",
          grouped ? "pointer-events-auto -my-2 w-fit max-w-full touch-pan-x" : "w-full",
        )}
      >
        {line.chips.map((c) => (
          <ToggleGroupItem
            key={c.key}
            value={c.key}
            aria-label={words(c)}
            data-testid="route-line-chip"
            className={cn(
              // The search's chips' pill (FilterChips), filled in the tint
              // while it is the way flown; its 44-point area round it.
              "relative h-8 shrink-0 gap-1.5 rounded-full border border-border bg-card px-3 font-medium text-foreground",
              "hit-y-1.5",
              "data-pressed:border-tint data-pressed:bg-tint data-pressed:text-primary-foreground hover:data-pressed:bg-tint",
              TEXT.detail,
            )}
          >
            <Route className="size-4 shrink-0" aria-hidden />
            <span>{shortLabel(c.label)}</span>
            {chipFigure(c) && <span className="font-semibold tabular-nums">{chipFigure(c)}</span>}
            {c.warning && <TriangleAlert className="size-4 shrink-0 text-caution in-data-pressed:text-inherit" aria-hidden />}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
