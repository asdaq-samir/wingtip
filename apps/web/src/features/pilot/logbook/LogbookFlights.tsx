import { lazy, Suspense, useState } from "react";
import { Plus } from "lucide-react";
import { EditToggle, RemoveMinus } from "../../../components/Favorites";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { Button } from "../../../components/ui/button";
import { useConfirm } from "../../../components/useConfirm";
import { useIsDesktop } from "../../../hooks/use-desktop";
import QueryState from "../../../components/QueryState";
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "../../../components/ResponsivePopover";
import { RemovableRow } from "../../../components/RemovableRow";
import type { LogbookEntry } from "../../../lib/api/types";
import { said } from "../../../lib/endorsements";
import EntryForm from "./EntryForm";
import { blankEntry, requestOf } from "./logbookEntry";
import { useLogbookFlights, type LogbookFlightsModel } from "./useLogbookFlights";

// A desktop's table on a chunk of its own (TanStack Table's model and the
// sort): a phone draws the list below and never loads it.
const LogbookTable = lazy(() => import("./LogbookTable"));

/** A flight's row: the day and route, the airplane, landings and remarks
 *  under, the hours at its end; tapped, its form in its place. */
function EntryRow({ e, vm }: { e: LogbookEntry; vm: LogbookFlightsModel }) {
  const day = said(e.flownOn);
  if (vm.changing === e.id) {
    // What the gateway refused of this row's last save, typed as it was.
    const refused = vm.refused?.id === e.id ? vm.refused : null;
    return (
      <div className="p-3" data-testid="logbook-entry-form">
        <EntryForm
          initial={refused?.entry ?? requestOf(e)}
          problem={refused?.problem}
          saving={vm.saving}
          onSave={(entry) => vm.update(e.id, entry)}
          onCancel={vm.stopChanging}
        />
      </div>
    );
  }
  const landings = e.dayLandings + e.nightLandings;
  // Taken off as every kept list's rows are -- its ••• or a long press, or
  // Edit's minus -- at once, with a toast's Undo.
  return (
    <RemovableRow name={`the flight of ${day}`} label={`Delete the flight of ${day}`} onDelete={() => vm.remove(e)}>
      <ListRow
        media={vm.editing ? <RemoveMinus label={`Delete the flight of ${day}…`} /> : undefined}
        title={`${day}${e.route ? ` · ${e.route}` : ""}`}
        description={[e.aircraft, e.aircraftType, `${landings} landing${landings === 1 ? "" : "s"}`, e.remarks].filter(Boolean).join(" · ")}
        value={`${e.totalHours.toFixed(1)} h`}
        onClick={vm.editing ? undefined : () => vm.change(e.id)}
        data-testid="logbook-entry"
      />
    </RemovableRow>
  );
}

/**
 * The logbook's flights, newest first: Add Entry logs one in its popover,
 * filled in with the airplane picked for planning; a row tapped is changed
 * in the row (Save, or Cancel and Escape to leave it), as the minimums and
 * the squawks are; its menu or Edit's minus takes one out, a toast's Undo
 * giving it back. On a desktop the flights are a table, sorted by
 * any column (LogbookTable); on a phone, this list.
 */
export default function LogbookFlights({ aircraft }: { aircraft?: string }) {
  const vm = useLogbookFlights();
  const { entries } = vm;
  // A new flight the gateway refused, back in the plus's form.
  const newRefused = vm.refused && vm.refused.id == null ? vm.refused : null;
  const desktop = useIsDesktop();
  // A new flight typed into and not saved: the popover asks before it
  // closes on it (a press outside, Escape), rather than losing it.
  const [typed, setTyped] = useState(false);
  const [askClose, closeDialog] = useConfirm({
    title: "Discard This Flight?",
    description: "What you typed is not logged.",
    confirmLabel: "Discard",
    destructive: true,
    onConfirm: () => {
      setTyped(false);
      vm.setAdding(false);
    },
  });
  return (
    <ListGroup
      title="Flights"
      action={
        <span className="flex items-center gap-1">
          {/* Every list's Edit (EditToggle). */}
          {(entries?.length ?? 0) > 0 && <EditToggle editing={vm.editing} onToggle={vm.toggleEditing} testId="logbook-edit" />}
          {/* The screen's primary, by its name at the group's top right
              (web.md §9), where a bare plus was. */}
          <ResponsivePopover
            open={vm.adding}
            onOpenChange={(open) => {
              if (!open && typed) askClose();
              else vm.setAdding(open);
            }}
          >
            <ResponsivePopoverTrigger asChild>
              <Button size="sm" className="relative after:absolute after:-inset-y-1.5 after:inset-x-0" data-testid="logbook-add">
                <Plus aria-hidden="true" />
                Add Entry
              </Button>
            </ResponsivePopoverTrigger>
            <ResponsivePopoverContent title="Add Entry" className="w-80 p-3" align="end">
              <EntryForm
                initial={newRefused?.entry ?? blankEntry(aircraft)}
                problem={newRefused?.problem}
                saving={vm.saving}
                onSave={(entry) => {
                  setTyped(false);
                  vm.add(entry);
                }}
                onDirtyChange={setTyped}
              />
            </ResponsivePopoverContent>
          </ResponsivePopover>
          {closeDialog}
        </span>
      }
    >
      {!entries ? (
        <QueryState row query={vm.asked} fetching="Fetching your logbook…" failed="Your logbook could not be fetched." />
      ) : !entries.length ? (
        <ListRow muted title="No flights logged yet: Add Entry logs one." />
      ) : desktop ? (
        <Suspense fallback={null}>
          <LogbookTable entries={entries} vm={vm} />
        </Suspense>
      ) : (
        // Each row drawn as it nears the screen (index.css row-lazy).
        entries.map((e) => (
          <div key={e.id} className="row-lazy">
            <EntryRow e={e} vm={vm} />
          </div>
        ))
      )}
    </ListGroup>
  );
}
