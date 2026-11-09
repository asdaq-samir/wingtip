import { Plus } from "lucide-react";
import { EditToggle, RemoveMinus } from "../../../components/Favorites";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import IconButton from "../../../components/IconButton";
import QueryState from "../../../components/QueryState";
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "../../../components/ResponsivePopover";
import { SwipeToDelete } from "../../../components/SwipeToDelete";
import { UndoRow } from "../../../components/UndoRow";
import type { LogbookEntry } from "../../../lib/api/types";
import { said } from "../../../lib/endorsements";
import EntryForm from "./EntryForm";
import { blankEntry, requestOf } from "./logbookEntry";
import { useLogbookFlights, type LogbookFlightsModel } from "./useLogbookFlights";

/** A flight's row: the day and route, the airplane, landings and remarks
 *  under, the hours at its end; tapped, its form in its place. */
function EntryRow({ e, vm }: { e: LogbookEntry; vm: LogbookFlightsModel }) {
  const day = said(e.flownOn);
  if (vm.changing === e.id) {
    return (
      <div className="p-3" data-testid="logbook-entry-form">
        <EntryForm initial={requestOf(e)} saving={vm.saving} onSave={(entry) => vm.update(e.id, entry)} onCancel={vm.stopChanging} />
      </div>
    );
  }
  const landings = e.dayLandings + e.nightLandings;
  // Taken off as every kept list's rows are -- a swipe to the left, or
  // Edit's minus bringing out the Delete -- at once, with Undo where it was.
  return (
    <SwipeToDelete label={`Delete the flight of ${day}`} onDelete={() => vm.remove(e)}>
      <ListRow
        media={vm.editing ? <RemoveMinus label={`Delete the flight of ${day}…`} /> : undefined}
        title={`${day}${e.route ? ` · ${e.route}` : ""}`}
        description={[e.aircraft, e.aircraftType, `${landings} landing${landings === 1 ? "" : "s"}`, e.remarks].filter(Boolean).join(" · ")}
        value={`${e.totalHours.toFixed(1)} h`}
        onClick={vm.editing ? undefined : () => vm.change(e.id)}
        data-testid="logbook-entry"
      />
    </SwipeToDelete>
  );
}

/**
 * The logbook's flights, newest first: the plus logs one in its popover,
 * filled in with the airplane picked for planning; a row tapped is changed
 * in the row (Save, or Cancel and Escape to leave it), as the minimums and
 * the squawks are; a swipe or Edit's minus takes one out, Undo in the
 * list giving it back.
 */
export default function LogbookFlights({ aircraft }: { aircraft?: string }) {
  const vm = useLogbookFlights();
  const { entries } = vm;
  return (
    <ListGroup
      title="Flights"
      action={
        <span className="flex items-center gap-1">
          {/* Every list's Edit (EditToggle). */}
          {(entries?.length ?? 0) > 0 && <EditToggle editing={vm.editing} onToggle={vm.toggleEditing} testId="logbook-edit" />}
          <ResponsivePopover open={vm.adding} onOpenChange={vm.setAdding}>
            <ResponsivePopoverTrigger asChild>
              <IconButton label="Log a flight" className="text-tint" data-testid="logbook-add">
                <Plus />
              </IconButton>
            </ResponsivePopoverTrigger>
            <ResponsivePopoverContent title="Log a flight" className="w-80 p-3" align="end">
              <EntryForm initial={blankEntry(aircraft)} saving={vm.saving} onSave={vm.add} />
            </ResponsivePopoverContent>
          </ResponsivePopover>
        </span>
      }
    >
      {vm.undoWords && <UndoRow said={vm.undoWords} onUndo={vm.undo} onDone={vm.forget} testId="logbook-undo" />}
      {!entries ? (
        <QueryState row query={vm.asked} fetching="Fetching your logbook…" failed="Your logbook could not be fetched." />
      ) : !entries.length ? (
        <ListRow muted title="No flights logged yet: the plus logs one." />
      ) : (
        entries.map((e) => <EntryRow key={e.id} e={e} vm={vm} />)
      )}
    </ListGroup>
  );
}
