import { NotebookPen, Plus } from "lucide-react";
import { ConsolePages, PageRow } from "../../components/ConsolePages";
import { useOpenPage } from "../../components/consolePagesContext";
import EmptyState from "../../components/EmptyState";
import { ListGroup } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { PadView } from "./PadView";
import { TEMPLATES } from "./templates";
import { useScratchpads, type PadRow } from "./useScratchpads";

/** When a page was last written, as its row says it: "21 Nov, 14:05". */
const whenWords = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * The scratchpad, You's page (ScratchpadRow): this flight's pages, then
 * the rest, each opening to its boxes and its ink (PadView), and New, a
 * menu of the templates, which starts a page for the flight open now.
 * Kept on this device; needs no sign-in.
 */
export function ScratchpadPage() {
  const vm = useScratchpads();
  const pages = Object.fromEntries(
    [...vm.thisFlight, ...vm.earlier].map((p) => [
      p.id,
      { title: p.title, content: <PadView id={p.id} onDelete={() => void vm.remove(p.id)} /> },
    ]),
  );
  return (
    <ConsolePages back="Scratchpad" pages={pages}>
      <div className="flex flex-col gap-5" data-testid="scratchpad-page">
        <NewPad create={vm.create} />
        {vm.thisFlight.length === 0 && vm.earlier.length === 0 && (
          <EmptyState icon={<NotebookPen />} title="No Pages Yet">
            Copy a clearance, the ATIS or the takeoff figures by hand or typed.
          </EmptyState>
        )}
        {vm.thisFlight.length > 0 && <Rows title={vm.flight ? `This flight · ${vm.flight}` : "This flight"} rows={vm.thisFlight} />}
        {vm.earlier.length > 0 && <Rows title="Earlier" rows={vm.earlier} />}
      </div>
    </ConsolePages>
  );
}

function Rows({ title, rows }: { title: string; rows: PadRow[] }) {
  return (
    <ListGroup title={title}>
      {rows.map((p) => (
        <PageRow
          key={p.id}
          page={p.id}
          title={p.title}
          description={p.flight && !title.includes(p.flight) ? p.flight : undefined}
          value={whenWords(p.updated)}
          testId="scratchpad-row"
        />
      ))}
    </ListGroup>
  );
}

/** New: the templates in a menu, the page opened as it is made. */
function NewPad({ create }: { create: ReturnType<typeof useScratchpads>["create"] }) {
  const open = useOpenPage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="relative self-end text-tint after:absolute after:-inset-1" data-testid="scratchpad-new" />
        }
      >
        <Plus aria-hidden /> New Page
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {TEMPLATES.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => void create(t.id).then(open)} data-testid={`scratchpad-new-${t.id}`}>
            {t.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
