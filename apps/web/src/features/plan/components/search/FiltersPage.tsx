import type { ReactNode } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../../../components/ui/button";
import { Switch } from "../../../../components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "../../../../components/ui/toggle-group";
import { TEXT } from "../../../../lib/text";
import {
  FUELS,
  RUNWAY_STEPS,
  SURFACES,
  SURFACE_WORDS,
  VFR_AT_STEPS,
  WITHIN_STEPS,
  runwayWords,
  vfrAtClock,
  vfrAtMenuWords,
  withinWords,
  type Fuel,
  type SearchFilters,
  type Surface,
} from "../../lib/searchFilters";
import { useSearchResults } from "../../hooks/useSearchResults";
import StepMenu from "./StepMenu";

/** A grouped inset list on the sheet's grey: a small grey header over a
 *  white rounded group, a hairline between its rows. */
function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      {title && <h3 className={cn("px-4 text-muted-foreground uppercase", TEXT.note)}>{title}</h3>}
      <div className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-2xl bg-card">{children}</div>
    </section>
  );
}

/** A row: its words at the left, its control at the right. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-h-11 items-center justify-between gap-3 px-4 py-1.5", TEXT.row)}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {children}
    </div>
  );
}

/**
 * A search's Filters, in the sheet in place of its results, as Apple Maps
 * opens its own from the filter chip (the owner's screenshot, 2026-11-10):
 * Cancel at the left, the title in the middle, Apply at the right; nothing
 * changes until Apply, and Cancel lets every change go. Grouped inset lists
 * of stock Switches, ToggleGroups and Menus, the same filters as the
 * chips over the results. Only what the planner's Nearest answers with is
 * offered (searchFilters): no fuel price, which the app has no source for.
 */
export default function FiltersPage() {
  const draft = useSearchResults((s) => s.draft);
  const setDraft = useSearchResults((s) => s.setDraft);
  const apply = useSearchResults((s) => s.applyDraft);
  const cancel = useSearchResults((s) => s.cancelDraft);
  if (!draft) return null;
  const sw = (key: keyof Pick<SearchFilters, "vfrNow" | "towered" | "publicOnly" | "approach">, label: string) => (
    <Row label={label}>
      <Switch
        checked={draft[key]}
        onCheckedChange={(checked: boolean) => setDraft({ [key]: checked } as Partial<SearchFilters>)}
        aria-label={label}
        data-testid={`filter-${key}`}
      />
    </Row>
  );
  const menuButton = (words: string) => (
    <Button variant="secondary" size="sm" className={cn("gap-1 rounded-full font-medium", TEXT.detail)}>
      {words}
      <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
    </Button>
  );
  return (
    <div className="flex flex-col gap-5 px-4 pb-6" data-testid="search-filters">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center">
        <button
          type="button"
          onClick={cancel}
          className={cn("relative justify-self-start text-tint after:absolute after:-inset-2", TEXT.row)}
          data-testid="filters-cancel"
        >
          Cancel
        </button>
        <h2 className={cn("font-bold", TEXT.title)}>Filters</h2>
        <button
          type="button"
          onClick={apply}
          className={cn("relative justify-self-end font-semibold text-tint after:absolute after:-inset-2", TEXT.row)}
          data-testid="filters-apply"
        >
          Apply
        </button>
      </header>
      <Group>
        {sw("towered", "Towered")}
        {sw("publicOnly", "Public Use")}
        {sw("approach", "Instrument Approach")}
      </Group>
      <Group title="Weather">
        {sw("vfrNow", "VFR Now")}
        <Row label="VFR at">
          <StepMenu
            value={draft.vfrInHours}
            steps={VFR_AT_STEPS}
            words={vfrAtMenuWords}
            onPick={(vfrInHours) => setDraft({ vfrInHours })}
            testId="filter-vfr-at"
            trigger={menuButton(vfrAtClock(draft.vfrInHours) ?? "Any Time")}
          />
        </Row>
      </Group>
      <Group title="Fuel">
        <Row label="Sells">
          <ToggleGroup
            multiple
            value={draft.fuel}
            onValueChange={(fuel) => setDraft({ fuel: FUELS.filter((k) => fuel.includes(k)) as Fuel[] })}
            aria-label="Fuel sold"
            variant="outline"
            size="sm"
            data-testid="filter-fuel"
          >
            {FUELS.map((k) => (
              <ToggleGroupItem key={k} value={k} className={TEXT.detail}>
                {k}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Row>
      </Group>
      <Group title="Runway">
        <Row label="Surface">
          <ToggleGroup
            multiple
            value={draft.surface}
            onValueChange={(surface) => setDraft({ surface: SURFACES.filter((k) => surface.includes(k)) as Surface[] })}
            aria-label="Runway surface"
            variant="outline"
            size="sm"
            data-testid="filter-surface"
          >
            {SURFACES.map((k) => (
              <ToggleGroupItem key={k} value={k} className={TEXT.detail}>
                {SURFACE_WORDS[k]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Row>
        <Row label="Longest Runway">
          <StepMenu
            value={draft.minRunwayFt}
            steps={RUNWAY_STEPS}
            words={runwayWords}
            onPick={(minRunwayFt) => setDraft({ minRunwayFt })}
            testId="filter-runway"
            trigger={menuButton(draft.minRunwayFt == null ? "Any" : `${draft.minRunwayFt.toLocaleString("en-US")} ft`)}
          />
        </Row>
      </Group>
      <Group title="Distance">
        <Row label="Within">
          <StepMenu
            value={draft.withinNm}
            steps={WITHIN_STEPS}
            words={withinWords}
            onPick={(withinNm) => setDraft({ withinNm })}
            testId="filter-within"
            trigger={menuButton(draft.withinNm == null ? "Any" : `${draft.withinNm} nm`)}
          />
        </Row>
      </Group>
    </div>
  );
}
