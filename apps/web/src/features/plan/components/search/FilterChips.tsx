import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "cn";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Toggle } from "../../../../components/ui/toggle";
import { TEXT } from "../../../../lib/text";
import {
  FUELS,
  RUNWAY_STEPS,
  SURFACES,
  SURFACE_WORDS,
  VFR_AT_STEPS,
  WITHIN_STEPS,
  filtersOn,
  listWords,
  runwayWords,
  vfrAtMenuWords,
  vfrAtWords,
  withinWords,
  type SearchFilters,
} from "../../lib/searchFilters";
import { useSearchResults } from "../../hooks/useSearchResults";
import CheckMenu from "./CheckMenu";
import StepMenu from "./StepMenu";

/** An outlined pill, filled in the tint while it is on (the stock Toggle's
 *  pressed state, through the tokens), as Apple's "Top Rated" chip is. */
const CHIP = cn(
  "h-8 shrink-0 gap-1 rounded-full border border-border bg-card px-3 font-medium text-foreground",
  "aria-pressed:border-tint aria-pressed:bg-tint aria-pressed:text-primary-foreground hover:aria-pressed:bg-tint",
  "data-[on]:border-tint data-[on]:bg-tint data-[on]:text-primary-foreground",
  TEXT.detail,
);

/**
 * The chips over a search's results (Apple Maps' row of "Open Now", "Top
 * Rated" and "All Chains ⌄", the owner's screenshots, 2026-11-10): the
 * Filters page's button first, its count on it, then the filters as stock
 * Toggles, and "VFR at…", the fuel, the surface, the runway and the
 * distance as stock Menus. They are the Filters page's state
 * (useSearchResults): a chip on is its switch on.
 */
export default function FilterChips() {
  const filters = useSearchResults((s) => s.filters);
  const set = useSearchResults((s) => s.setFilters);
  const openFilters = useSearchResults((s) => s.openFilters);
  const on = filtersOn(filters);
  const toggle = (key: "vfrNow" | "towered" | "publicOnly" | "approach", label: string) => (
    <Toggle
      variant="outline"
      size="sm"
      pressed={filters[key]}
      onPressedChange={(pressed: boolean) => set({ [key]: pressed } as Partial<SearchFilters>)}
      className={CHIP}
      data-testid={`chip-${key}`}
    >
      {label}
    </Toggle>
  );
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none]" data-testid="search-chips">
      <Button
        variant="outline"
        size="sm"
        onClick={openFilters}
        aria-label="Filters"
        className={cn(CHIP, "px-2.5")}
        data-testid="chip-filters"
      >
        <SlidersHorizontal className="size-4 text-tint" aria-hidden="true" />
        {on > 0 && <Badge className="h-5 min-w-5 rounded-full bg-tint px-1 text-primary-foreground">{on}</Badge>}
      </Button>
      {toggle("vfrNow", "VFR Now")}
      <StepMenu
        value={filters.vfrInHours}
        steps={VFR_AT_STEPS}
        words={vfrAtMenuWords}
        onPick={(vfrInHours) => set({ vfrInHours })}
        testId="chip-vfr-at"
        trigger={
          <Button variant="outline" size="sm" className={CHIP} data-on={filters.vfrInHours != null || undefined}>
            {vfrAtWords(filters.vfrInHours)}
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        }
      />
      {toggle("towered", "Towered")}
      {toggle("approach", "Approach")}
      <CheckMenu
        picked={filters.fuel}
        items={FUELS}
        words={(k) => k}
        onPick={(fuel) => set({ fuel })}
        testId="chip-fuel"
        trigger={
          <Button variant="outline" size="sm" className={CHIP} data-on={filters.fuel.length > 0 || undefined}>
            {listWords(filters.fuel, "Fuel")}
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        }
      />
      <CheckMenu
        picked={filters.surface}
        items={SURFACES}
        words={(k) => SURFACE_WORDS[k]}
        onPick={(surface) => set({ surface })}
        testId="chip-surface"
        trigger={
          <Button variant="outline" size="sm" className={CHIP} data-on={filters.surface.length > 0 || undefined}>
            {listWords(
              filters.surface.map((k) => SURFACE_WORDS[k]),
              "Surface",
            )}
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        }
      />
      {toggle("publicOnly", "Public")}
      <StepMenu
        value={filters.minRunwayFt}
        steps={RUNWAY_STEPS}
        words={runwayWords}
        onPick={(minRunwayFt) => set({ minRunwayFt })}
        testId="chip-runway"
        trigger={
          <Button variant="outline" size="sm" className={CHIP} data-on={filters.minRunwayFt != null || undefined}>
            {runwayWords(filters.minRunwayFt)}
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        }
      />
      <StepMenu
        value={filters.withinNm}
        steps={WITHIN_STEPS}
        words={withinWords}
        onPick={(withinNm) => set({ withinNm })}
        testId="chip-within"
        trigger={
          <Button variant="outline" size="sm" className={CHIP} data-on={filters.withinNm != null || undefined}>
            {withinWords(filters.withinNm)}
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        }
      />
    </div>
  );
}
