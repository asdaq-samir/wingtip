import { lazy, Suspense } from "react";
import { ClipboardList, Dumbbell, Siren, Target } from "lucide-react";
import ChecklistPage from "../../components/ChecklistPage";
import { PageRow } from "../../components/ConsolePages";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { RowBadge } from "../../components/RowBadge";
import { aircraftKey, shortName } from "../../lib/aircraftChoice";
import type { AircraftChoice } from "../../lib/api/types";
import { wantScreen } from "../../lib/navigation/wanted";
import { SETTING_BADGE } from "../../lib/rowBadges";

// Its own chunk, as the Logbook's: it reads the saved flights' debriefs
// only when opened.
const CoachPage = lazy(() => import("./coach/CoachPage"));

/*
 * Setup's rows for what was three or four taps down (docs/navigation.md's
 * gaps 1 to 3): the picked airplane's checklists, the coach, the drills
 * and the emergency assistant, each a row of Setup's own list, so each
 * is two taps from the map. The pages they open are the same ones their
 * deeper homes open; nothing moved, at the owner's "Just add the buttons
 * and options where they make sense intuitively, pilots don't have time
 * to find where things are" (2026-11-09). Each row is its own component,
 * one child of the list, so the list keeps its hairlines between rows.
 */

/** The picked airplane's checklists, Setup's Checklists page. */
export function SetupChecklistsPage({ aircraft }: { aircraft: AircraftChoice }) {
  return <ChecklistPage key={aircraftKey(aircraft)} airplane={aircraftKey(aircraft)} name={shortName(aircraft.label)} />;
}

/** The coach, Setup's Coach page: the Logbook's own, on its own chunk. */
export function SetupCoachPage() {
  return (
    <Suspense fallback={null}>
      <CoachPage />
    </Suspense>
  );
}

/** The airplane picked for planning's checklists, kept on this device:
 *  no sign-in needed, as the Brief's are not. */
export function ChecklistsRow({ aircraft }: { aircraft: AircraftChoice }) {
  return (
    <PageRow
      page="checklists"
      title="Checklists"
      value={aircraft.none ? undefined : shortName(aircraft.label)}
      testId="checklists-row"
      media={
        <RowBadge colour={SETTING_BADGE.checklists}>
          <ClipboardList />
        </RowBadge>
      }
    />
  );
}

/** The training coach: the pilot's logbook and flights read, so kept to
 *  an account as the Logbook is. */
export function CoachRow({ disabled, value }: { disabled: boolean; value?: string }) {
  return (
    <PageRow
      page="coach"
      title="Coach"
      disabled={disabled}
      value={value}
      testId="setup-coach-row"
      media={
        <RowBadge colour={SETTING_BADGE.coach}>
          <Target />
        </RowBadge>
      }
    />
  );
}

/** The drills: light gun, VFR minimums, holding entries, lost comms. */
export function PracticeRow() {
  return (
    <PageRow
      page="practice"
      title="Practice"
      testId="practice-row"
      media={
        <RowBadge colour={SETTING_BADGE.practice}>
          <Dumbbell />
        </RowBadge>
      }
    />
  );
}

/**
 * The emergency assistant, its own group so it stands apart from the
 * pilot's things: opened by its name (lib/navigation/wanted), the one way
 * in a link and the flying head use, where on the ground it was five or
 * six taps away once its map button went (the owner, 2026-11-08).
 */
export function EmergencyGroup() {
  return (
    <ListGroup>
      <ListRow
        title="Emergency Assistant"
        description="The best fields within a glide, the checklist, 7700 and 121.5"
        onClick={() => wantScreen("emergency")}
        data-testid="setup-emergency"
        media={
          <RowBadge colour={SETTING_BADGE.emergency}>
            <Siren />
          </RowBadge>
        }
      />
    </ListGroup>
  );
}
