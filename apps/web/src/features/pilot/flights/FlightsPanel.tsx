import { Button as BaseButton } from "@base-ui/react/button";
import { Link2Off, Pencil, Route, Share, Trash2 } from "lucide-react";
import { cn } from "cn";
import EmptyState from "../../../components/EmptyState";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { ConsolePages, PageRow } from "../../../components/ConsolePages";
import { EditToggle, ListPageHead, RemoveMinus } from "../../../components/Favorites";
import QueryState from "../../../components/QueryState";
import RowMenu from "../../../components/RowMenu";
import { RemovableRow } from "../../../components/RemovableRow";
import type { FlightSummary } from "../../../lib/api/types";
import { planHrefOf } from "../../../lib/flightLink";
import { sharedPlanLink } from "../../../lib/sharedFlight";
import { dayMonthYear, feet, nm } from "../../../lib/format";
import { LEVEL_TONE, riskLine, type RiskLevel } from "../../../lib/frat";
import { routeName } from "../../../lib/identSchema";
import FlightPage from "../FlightPage";
import FlightFields from "./FlightFields";
import { flightTitle } from "./flightEdit";
import { useSavedFlights, type SavedFlightsModel } from "./useSavedFlights";
import { NO_FLIGHTS } from "../../../lib/emptyWords";

// Edit's row menu's Share: the plan in the link itself, opened as a preview
// (lib/sharedFlight); the menu's is the saved flight's own, which can be stopped.
const shareOf = (f: FlightSummary) => ({
  title: flightTitle(f),
  url: sharedPlanLink(
    {
      dep: f.departureIdent,
      dest: f.destinationIdent,
      stops: f.stops,
      altitudeFt: f.cruiseAltitudeFt ?? null,
      depart: null,
      type: null,
      rules: null,
      tail: null,
    },
    location.origin,
  ),
});

/** A saved flight's row: its name (its route where it has none) and
 *  tail, then the route under a name, the figures, the risk it was saved
 *  with and the pilot's notes. */
function rowOf(f: FlightSummary) {
  const route = routeName(f.departureIdent, f.destinationIdent, f.stops);
  return {
    title: (
      <>
        <span className={cn("font-semibold", !f.name && "font-mono")}>{flightTitle(f)}</span>
        {f.aircraftTailNumber && <span className="text-muted-foreground"> {f.aircraftTailNumber}</span>}
      </>
    ),
    description: (
      <span className="tabular-nums">
        {f.name && <span className="block font-mono">{route}</span>}
        {feet(f.cruiseAltitudeFt)}
        {f.totalDistanceNm != null && ` · ${nm(f.totalDistanceNm)}`} · saved {dayMonthYear(new Date(f.createdAt))}
        {/* The risk assessment it was saved with (lib/frat). */}
        {f.risk && (
          <span className={cn("block", LEVEL_TONE[f.risk.level as RiskLevel])} data-testid="flight-risk">
            Risk {riskLine(f.risk).toLowerCase()}
          </span>
        )}
        {f.notes && (
          <span className="line-clamp-2 block whitespace-pre-line" data-testid="saved-flight-notes-shown">
            {f.notes}
          </span>
        )}
      </span>
    ),
  };
}

/** One flight's row: its fields while it is changed, Edit's minus and
 *  its name to tap while the list is in Edit, else its page a tap away
 *  with Edit, Share and Remove at its ••• or a long press. */
function SavedFlightRow({ f, vm }: { f: FlightSummary; vm: SavedFlightsModel }) {
  const title = flightTitle(f);
  const remove = () => vm.deleteFlight(f);
  if (vm.changing === f.id) {
    return (
      <FlightFields
        flight={f}
        draft={vm.draft}
        problem={vm.problem}
        saving={vm.saving}
        onSave={(name, notes) => vm.saveChange(f, name, notes)}
        onCancel={vm.cancelChange}
      />
    );
  }
  const row = rowOf(f);
  // Taken off as every kept list's rows are -- its menu or Edit's minus --
  // with a toast's Undo (RemovableRow, useSavedFlights).
  return vm.editing ? (
    <RemovableRow name={title} label={`Delete ${title}`} onDelete={remove} share={shareOf(f)}>
      <ListRow
        {...row}
        // In Edit, the name is what changes it, as iOS's lists rename a
        // row tapped in Edit.
        title={
          <BaseButton
            className="relative text-left text-tint after:absolute after:-inset-y-3 after:inset-x-0"
            onClick={() => vm.startChange(f.id)}
            data-testid="saved-flight-rename"
          >
            {row.title}
          </BaseButton>
        }
        media={<RemoveMinus label={`Delete ${title}…`} />}
      />
    </RemovableRow>
  ) : (
    // Its own page: what was filed, the way back onto the map, and its
    // debrief; at its end ••• or a long press, as every list's.
    <RowMenu
      label={`More for ${title}`}
      testId="saved-flight-more"
      actions={[
        // Its fields take the focus, as a question does: opened once
        // the menu has closed and let go of it (RowMenu's `asks`).
        { label: "Edit", icon: <Pencil />, asks: true, testId: "saved-flight-edit", onSelect: () => vm.startChange(f.id) },
        // A link that opens it read-only, until Stop Sharing, with the
        // airplane's N-number where it has one (the owner, 2026-11-11).
        { label: "Share", icon: <Share />, testId: "saved-flight-share", onSelect: () => void vm.shareFlight(f) },
        ...(f.share
          ? [{ label: "Stop Sharing", icon: <Link2Off />, testId: "saved-flight-stop-sharing", onSelect: () => void vm.stopSharing(f) }]
          : []),
        { label: "Remove", icon: <Trash2 />, destructive: true, onSelect: remove, testId: "saved-flight-delete" },
      ]}
    >
      <PageRow page={`flight-${f.id}`} {...row} />
    </RowMenu>
  );
}

/** A signed-in pilot's own filed flights. Filing one happens from the
 *  route's Share menu (Save); here a flight opens back on the planner
 *  (same route and altitude), is named and noted in its row, or is
 *  deleted. A grouped list at every width, as iOS lists things: a tap on
 *  a row opens the flight; Edit over the list puts a red minus before
 *  each row, which deletes it with a toast's Undo, and
 *  makes each name the way to change it. */
export function FlightsPanel({
  onBack,
}: {
  /** Shown as FPL's Saved in full (SavedStrip's title): headed as its
   *  Recents' page is, Back at its left and Edit at its right, at the
   *  owner's notice ("When clicking on See All for Saved it's not giving
   *  option to go back like recents or favorites"). */
  onBack?: () => void;
} = {}) {
  const vm = useSavedFlights();
  const { list } = vm;

  // A page a flight (FlightPage), opened from its row.
  const pages = Object.fromEntries(
    (list ?? []).map((f) => [`flight-${f.id}`, { title: flightTitle(f), content: <FlightPage summary={f} planHref={planHrefOf(f)} /> }]),
  );

  // Every list's Edit (EditToggle), where this was a copy of it.
  const edit = <EditToggle editing={vm.editing} onToggle={vm.toggleEditing} testId="flights-edit" />;
  return (
    <ConsolePages back="Flights" pages={pages}>
      <section aria-label="Flights" className={onBack ? "space-y-3" : undefined}>
        {onBack && (
          <ListPageHead
            title="Saved"
            backLabel="Back to FPL"
            onBack={onBack}
            action={list?.length ? edit : undefined}
            testId="saved-page"
          />
        )}
        {!list ? (
          // Where they could not be fetched, said here with Try again, where
          // the list showed nothing.
          <QueryState query={vm.asked} fetching="Fetching your flights…" failed="Your flights could not be fetched." />
        ) : list.length === 0 ? (
          <EmptyState icon={<Route />} title={NO_FLIGHTS}>
            Plan a route and Save it from Share; it is kept here.
          </EmptyState>
        ) : (
          <ListGroup title={onBack ? undefined : "Saved flights"} action={onBack ? undefined : edit}>
            {list.map((f) => (
              <SavedFlightRow key={f.id} f={f} vm={vm} />
            ))}
          </ListGroup>
        )}
      </section>
    </ConsolePages>
  );
}
