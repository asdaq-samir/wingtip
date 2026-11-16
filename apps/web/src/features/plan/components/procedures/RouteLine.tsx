import { useAirplaneChosen } from "../../../../lib/preferences";
import { Route, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { ToggleGroup, ToggleGroupItem } from "../../../../components/ui/toggle-group";
import { TEXT } from "../../../../lib/text";
import { gal } from "../../../../lib/format";
import { andList } from "../../../../lib/listWords";

/** FPL's route line's choices (PlanWorkspace's routeLine): each chip's
 *  key and words, and what its way meets, in amber; the one picked. */
export interface RouteLineChoices {
  /** Each way: its key, name, what it meets, its whole time ("2h 59m"),
   *  and its miles and fuel. */
  chips: { key: string; label: string; warning: string | null; time: string | null; nm: number | null; gal: number | null }[];
  picked: string;
  onPick: (key: string) => void;
  /** What the planner could not check the ways for, in the engine's words
   *  ("service ceiling", "fuel", "start and taxi fuel"): said under them. */
  unchecked?: string[];
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
 * screen reader. A way that meets something says so in amber, its name
 * too: the planner warns, never refuses.
 */
/** A way's miles and fuel, "105 nm, 10.3 gal", as far as they are known. */
const figures = (c: RouteLineChoices["chips"][number]) =>
  [c.nm != null ? `${Math.round(c.nm)} nm` : null, c.gal != null ? gal(c.gal) : null].filter(Boolean).join(", ");

export function RouteLine({ line: asked, grouped = false }: { line: RouteLineChoices; grouped?: boolean }) {
  // No airplane picked: each way's miles, not its time or fuel, which are
  // an airplane's (the owner, 2026-11-08: "don't assume").
  const airplane = useAirplaneChosen();
  const line = airplane ? asked : { ...asked, chips: asked.chips.map((c) => ({ ...c, time: null, gal: null })) };
  const words = (c: RouteLineChoices["chips"][number]) =>
    `${c.key === "none" ? "As typed, the route as typed" : c.label}${c.time ? `, ${c.time}` : ""}${figures(c) ? `, ${figures(c)}` : ""}${c.warning ? `, ${c.warning.toLowerCase()}` : ""}`;
  return (
    <div
      className={cn(grouped ? "pb-1" : "mt-2 mb-1", line.stale && "opacity-50 transition-opacity motion-reduce:transition-none")}
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
        // scrolling row would cut off.
        className="flex w-full justify-start gap-2 overflow-x-auto overscroll-x-contain py-1.5 [scrollbar-width:none]"
      >
        {line.chips.map((c) => (
          <ToggleGroupItem
            key={c.key}
            value={c.key}
            aria-label={words(c)}
            data-testid="route-line-chip"
            data-key={c.key}
            className={cn(
              // The search's chips' pill (FilterChips), filled in the tint
              // while it is the way flown; its 44-point area round it.
              "relative h-8 shrink-0 gap-1.5 rounded-full border border-border bg-card px-3 font-medium text-foreground",
              "after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
              "data-pressed:border-tint data-pressed:bg-tint data-pressed:text-primary-foreground hover:data-pressed:bg-tint",
              TEXT.detail,
            )}
          >
            <Route className="size-4 shrink-0" aria-hidden />
            <span className={cn(c.warning && "text-caution-ink in-data-pressed:text-inherit")}>{c.label}</span>
            {c.time && <span className="font-semibold">{c.time}</span>}
            {c.warning && <TriangleAlert className="size-4 shrink-0 text-caution in-data-pressed:text-inherit" aria-hidden />}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {/* Said where the ways are, not left out: a way's fuel or ceiling
          the planner could not check, the airplane's figure missing. */}
      {line.unchecked && line.unchecked.length > 0 && (
        <p className={cn("px-1 pt-1.5 text-muted-foreground", TEXT.note)} data-testid="route-line-unchecked">
          {`Not checked: ${andList(line.unchecked)}`}
        </p>
      )}
    </div>
  );
}
