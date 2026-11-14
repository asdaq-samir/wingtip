import { useAirplaneChosen } from "../../../../lib/preferences";
import { ChevronDown, Route } from "lucide-react";
import { cn } from "cn";
import { ToggleGroup, ToggleGroupItem } from "../../../../components/ui/toggle-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../../components/ui/collapsible";
import { TEXT } from "../../../../lib/text";
import { gal } from "../../../../lib/format";
import { andList } from "../../../../lib/listWords";
import { useRouteLineOpen } from "../../lib/routeLine";

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
}

/**
 * FPL's Routes, over the route's fields, at the owner's pick of the
 * canvas's K1 (2026-10-29): folded, one row -- the route's glyph, the way
 * flown and its time, how many more there are; open, its heading and the
 * planner's ways as cards, each its time over its name, a tap on one the
 * route at once ("As typed" is the route as typed, the owner's word for
 * what was "None", 2026-11-08), its miles and fuel under its name. It was a tray under the
 * departure's row, folded to the way picked, as a runway line is. Open
 * until its row folds it (the owner, 2026-10-28: "Keep the routes and
 * runway opened until folded"). A way that meets something says so in
 * amber, in its name too: the planner warns, never refuses.
 */
/** The Routes row. `grouped`: inside Route Cards' head box (PlanWorkspace),
 *  under the airplane and the altitude, the box's fill and corners its
 *  own; else a rounded row of its own over the list. */
/** A card's miles and fuel, "105 nm · 10.3 gal", as far as they are known. */
const figures = (c: RouteLineChoices["chips"][number]) =>
  [c.nm != null ? `${Math.round(c.nm)} nm` : null, c.gal != null ? gal(c.gal) : null].filter(Boolean).join(" · ");

export function RouteLine({ line: asked, grouped = false }: { line: RouteLineChoices; grouped?: boolean }) {
  const open = useRouteLineOpen((s) => s.open);
  // No airplane picked: each way's miles, not its time or fuel, which are
  // an airplane's (the owner, 2026-11-08: "don't assume").
  const airplane = useAirplaneChosen();
  const line = airplane ? asked : { ...asked, chips: asked.chips.map((c) => ({ ...c, time: null, gal: null })) };
  const picked = line.chips.find((c) => c.key === line.picked) ?? line.chips[0]!;
  const words = (c: RouteLineChoices["chips"][number]) =>
    `${c.key === "none" ? "As typed, the route as typed" : c.label}${c.time ? `, ${c.time}` : ""}${figures(c) ? `, ${figures(c)}` : ""}${c.warning ? `, ${c.warning.toLowerCase()}` : ""}`;
  const others = line.chips.length - 1;
  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => useRouteLineOpen.setState({ open: next })}
      className={grouped ? undefined : "mt-2 mb-1 rounded-xl bg-card"}
      data-testid="route-line"
    >
      <CollapsibleTrigger
        render={
          <button
            type="button"
            data-testid="route-line-toggle"
            data-disclosure=""
            // What it shows first, then what it is (WCAG 2.5.3, Label in Name).
            aria-label={
              open
                ? "Routes: fold"
                : `${picked.label}${picked.time ? ` ${picked.time}` : ""}${others > 0 ? ` ${others} more` : ""}, Routes: ${words(picked)}`
            }
            className={cn(
              "flex min-h-11 w-full items-center gap-2.5 px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
              TEXT.row,
            )}
          />
        }
      >
        <Route className="size-5 shrink-0 text-tint" aria-hidden />
        {open ? (
          <span className="flex-1 font-semibold">Routes</span>
        ) : (
          <span className="min-w-0 flex-1 truncate" data-testid="route-line-picked" data-key={picked.key}>
            {picked.label}
            {picked.time && <span className="font-semibold"> {picked.time}</span>}
          </span>
        )}
        {/* A space between them in the words, as the gap is on screen. */}
        {!open && others > 0 && " "}
        {!open && others > 0 && <span className={cn("shrink-0 text-muted-foreground", TEXT.detail)}>{others} more</span>}
        <ChevronDown
          className={cn("size-4 shrink-0 text-tint transition-transform motion-reduce:transition-none", open && "rotate-180")}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ToggleGroup
          value={[line.picked]}
          onValueChange={(v) => {
            if (v[0]) line.onPick(v[0]);
          }}
          aria-label="Routes"
          className="flex w-full justify-start gap-2 overflow-x-auto overscroll-x-contain px-3 pb-3 [scrollbar-width:none]"
        >
          {line.chips.map((c) => (
            <ToggleGroupItem
              key={c.key}
              value={c.key}
              aria-label={words(c)}
              data-testid="route-line-chip"
              data-key={c.key}
              className={cn(
                "h-auto min-w-24 max-w-44 shrink-0 flex-col items-start gap-0.5 rounded-xl border border-border bg-background px-2.5 py-2 text-left",
                "data-pressed:border-2 data-pressed:border-tint data-pressed:bg-tint/12",
              )}
            >
              {(airplane || c.time) && (
                <span className={cn("font-semibold", TEXT.row, c.key === line.picked && "text-tint")}>{c.time ?? "—"}</span>
              )}
              <span className={cn("whitespace-normal", TEXT.note, c.warning ? "text-caution-ink" : "text-foreground")}>{c.label}</span>
              {figures(c) && (
                <span className={cn("text-muted-foreground tabular-nums", TEXT.note)} data-testid="route-line-figures">
                  {figures(c)}
                </span>
              )}
              {/* What it crosses, the engine's words: warned, never refused. */}
              {c.warning && (
                <span className={cn("whitespace-normal font-semibold text-caution-ink", TEXT.note)} data-testid="route-line-warning">
                  {c.warning}
                </span>
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {/* Said where the ways are, not left out: a way's fuel or ceiling
            the planner could not check, the airplane's figure missing. */}
        {line.unchecked && line.unchecked.length > 0 && (
          <p className={cn("px-3 pb-3 text-muted-foreground", TEXT.note)} data-testid="route-line-unchecked">
            {`Not checked: ${andList(line.unchecked)}`}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
