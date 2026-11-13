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
import { ListGroup, ListRow } from "../../../../components/GroupedList";

/**
 * A search's Filters, in the sheet in place of its results, as Apple Maps
 * opens its own from the filter chip (the owner's screenshot, 2026-11-10):
 * Cancel at the left, the title in the middle, Apply at the right; nothing
 * changes until Apply, and Cancel lets every change go. The app's grouped
 * lists (ListGroup, its titles the 20-point SectionTitle as every
 * section's), each row a ListRow, of stock Switches, ToggleGroups and Menus, the same filters as the
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
    <ListRow title={label}>
      <Switch
        checked={draft[key]}
        onCheckedChange={(checked: boolean) => setDraft({ [key]: checked } as Partial<SearchFilters>)}
        aria-label={label}
        data-testid={`filter-${key}`}
      />
    </ListRow>
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
        <Button
          variant="link"
          size="inline"
          onClick={cancel}
          className={cn("relative justify-self-start after:absolute after:-inset-2", TEXT.row)}
          data-testid="filters-cancel"
        >
          Cancel
        </Button>
        <h2 className={cn("font-bold", TEXT.title)}>Filters</h2>
        <Button
          variant="link"
          size="inline"
          onClick={apply}
          className={cn("relative justify-self-end font-semibold after:absolute after:-inset-2", TEXT.row)}
          data-testid="filters-apply"
        >
          Apply
        </Button>
      </header>
      <ListGroup>
        {sw("towered", "Towered")}
        {sw("publicOnly", "Public Use")}
        {sw("approach", "Instrument Approach")}
      </ListGroup>
      <ListGroup title="Weather">
        {sw("vfrNow", "VFR Now")}
        <ListRow title="VFR at">
          <StepMenu
            value={draft.vfrInHours}
            steps={VFR_AT_STEPS}
            words={vfrAtMenuWords}
            onPick={(vfrInHours) => setDraft({ vfrInHours })}
            testId="filter-vfr-at"
            trigger={menuButton(vfrAtClock(draft.vfrInHours) ?? "Any Time")}
          />
        </ListRow>
      </ListGroup>
      <ListGroup title="Fuel">
        <ListRow title="Sells">
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
        </ListRow>
      </ListGroup>
      <ListGroup title="Runway">
        <ListRow title="Surface">
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
        </ListRow>
        <ListRow title="Longest Runway">
          <StepMenu
            value={draft.minRunwayFt}
            steps={RUNWAY_STEPS}
            words={runwayWords}
            onPick={(minRunwayFt) => setDraft({ minRunwayFt })}
            testId="filter-runway"
            trigger={menuButton(draft.minRunwayFt == null ? "Any" : `${draft.minRunwayFt.toLocaleString("en-US")} ft`)}
          />
        </ListRow>
      </ListGroup>
      <ListGroup title="Distance">
        <ListRow title="Within">
          <StepMenu
            value={draft.withinNm}
            steps={WITHIN_STEPS}
            words={withinWords}
            onPick={(withinNm) => setDraft({ withinNm })}
            testId="filter-within"
            trigger={menuButton(draft.withinNm == null ? "Any" : `${draft.withinNm} nm`)}
          />
        </ListRow>
      </ListGroup>
    </div>
  );
}
