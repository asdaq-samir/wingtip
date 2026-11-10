import { ArrowDownUp, ListFilter } from "lucide-react";
import { cn } from "cn";
import { Toolbar } from "@base-ui/react/toolbar";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { TEXT } from "../../lib/text";
import { useNotamMarks } from "./notamMarks";
import { showsAll, type NotamFilter, type NotamKind, type NotamSort, type NotamWhen } from "./notamView";

const SORTS: { value: NotamSort; label: string }[] = [
  { value: "rank", label: "Most Important" },
  { value: "newest", label: "Newest" },
  { value: "soonest", label: "Starting Soonest" },
];

/** A toolbar button's look: the tint, its 44-point reach a pseudo-element. */
const TOOL =
  "relative inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-medium text-tint outline-none after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] hover:bg-tint/10 focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-tint/12";

const toggled = <T,>(list: T[], item: T, on: boolean) => (on ? [...list, item] : list.filter((x) => x !== item));

/**
 * The NOTAMs' filter and sort, as ForeFlight 18.6 has them (web.md §6): a
 * toolbar of two menus, one tab stop with the arrows between them (Base
 * UI Toolbar, the APG's toolbar), each a menu of checkbox or radio items,
 * not a slider (decision 0017). Kept per browser (notamMarks).
 */
export default function NotamToolbar() {
  const filter = useNotamMarks((s) => s.filter);
  const sort = useNotamMarks((s) => s.sort);
  const setFilter = useNotamMarks((s) => s.setFilter);
  const setSort = useNotamMarks((s) => s.setSort);
  const set = (change: Partial<NotamFilter>) => setFilter({ ...filter, ...change });
  const kind = (k: NotamKind, label: string) => (
    <DropdownMenuCheckboxItem
      checked={filter.kinds.includes(k)}
      onCheckedChange={(on) => set({ kinds: toggled(filter.kinds, k, on) })}
      closeOnClick={false}
      data-testid={`notam-filter-${k}`}
    >
      {label}
    </DropdownMenuCheckboxItem>
  );
  const when = (w: NotamWhen, label: string) => (
    <DropdownMenuCheckboxItem
      checked={filter.when.includes(w)}
      onCheckedChange={(on) => set({ when: toggled(filter.when, w, on) })}
      closeOnClick={false}
      data-testid={`notam-filter-${w}`}
    >
      {label}
    </DropdownMenuCheckboxItem>
  );
  return (
    <Toolbar.Root aria-label="NOTAM filters" className={cn("-ml-3 flex items-center gap-1", TEXT.detail)} data-testid="notam-toolbar">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Toolbar.Button className={TOOL} data-testid="notam-filter" />}>
          <ListFilter className="size-4" aria-hidden="true" />
          {showsAll(filter) ? "Filter" : "Filtered"}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className={cn("font-normal text-muted-foreground", TEXT.note)}>Kind</DropdownMenuLabel>
            {kind("notam", "NOTAMs")}
            {kind("tfr", "TFRs")}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className={cn("font-normal text-muted-foreground", TEXT.note)}>When</DropdownMenuLabel>
            {when("now", "In Force for the Flight")}
            {when("later", "Later")}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={filter.read}
            onCheckedChange={(read) => set({ read })}
            closeOnClick={false}
            data-testid="notam-filter-read"
          >
            Show Read
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Toolbar.Button className={TOOL} data-testid="notam-sort" />}>
          <ArrowDownUp className="size-4" aria-hidden="true" />
          {SORTS.find((s) => s.value === sort)?.label}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className={cn("font-normal text-muted-foreground", TEXT.note)}>Sort By</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as NotamSort)}>
              {SORTS.map((s) => (
                <DropdownMenuRadioItem key={s.value} value={s.value} data-testid={`notam-sort-${s.value}`}>
                  {s.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </Toolbar.Root>
  );
}
