import { lazy, Suspense } from "react";
import { ClipboardList, Dumbbell, GraduationCap, Siren, Target } from "lucide-react";
import { cn } from "cn";
import ChecklistPage from "../../components/ChecklistPage";
import { ConsolePages, PageRow } from "../../components/ConsolePages";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { RowBadge } from "../../components/RowBadge";
import { aircraftKey, shortName } from "../../lib/aircraftChoice";
import { wantScreen } from "../../lib/navigation/wanted";
import { usePreferences } from "../../lib/preferences";
import { SETTING_BADGE } from "../../lib/rowBadges";
import { TEXT } from "../../lib/text";
import { AircraftPanel } from "./AccountPanels";
import PracticePage from "./Practice";

// Its own chunk, as the Logbook's: it reads the saved flights' debriefs
// only when opened.
const CoachPage = lazy(() => import("./coach/CoachPage"));

/*
 * You's rows that open a page of pages (the owner's option A, 2026-11-13):
 * Airplanes, with the checklists inside it, and Training, the coach and
 * the drills; and the emergency assistant, its own group. Each row is its
 * own component, one child of the list, so the list keeps its hairlines
 * between rows.
 */

/**
 * Airplanes, with the picked airplane's checklists in it (the owner,
 * 2026-11-13: Checklists inside Airplanes, per airplane), where they were
 * a row of You's own: the pilot's airplanes (AircraftPanel, each one's own
 * checklists and squawks in its form), and under them the checklists of
 * the one picked for planning, kept on this device, so signed out too,
 * with no list of airplanes to keep. The row's group steps aside while a
 * page of an airplane's is open (data-slot), as a page's head does.
 */
export function AirplanesPage({ signedIn }: { signedIn: boolean }) {
  const aircraft = usePreferences((s) => s.aircraft);
  return (
    <ConsolePages
      back="Airplanes"
      pages={{
        checklists: {
          title: "Checklists",
          content: <ChecklistPage key={aircraftKey(aircraft)} airplane={aircraftKey(aircraft)} name={shortName(aircraft.label)} />,
        },
      }}
    >
      <div className="flex flex-col gap-5 [&:has([data-slot=console-page])>[data-slot=airplanes-more]]:hidden">
        {signedIn ? (
          <AircraftPanel />
        ) : (
          <p className={cn("px-1 text-muted-foreground", TEXT.note)}>Sign in to keep your airplanes.</p>
        )}
        <div data-slot="airplanes-more">
          <ListGroup>
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
          </ListGroup>
        </div>
      </div>
    </ConsolePages>
  );
}

/** Training, one row of You opening the coach and the drills (the owner,
 *  2026-11-13), where they were two rows of its list. */
export function TrainingRow() {
  return (
    <ListGroup>
      <PageRow
        page="training"
        title="Training"
        testId="training-row"
        media={
          <RowBadge colour={SETTING_BADGE.coach}>
            <GraduationCap />
          </RowBadge>
        }
      />
    </ListGroup>
  );
}

/** Training's page: the coach -- the pilot's logbook and flights read, so
 *  kept to an account as the Logbook is -- and the drills: light gun, VFR
 *  minimums, holding entries, lost comms. */
export function TrainingPage({ signedIn }: { signedIn: boolean }) {
  return (
    <ConsolePages
      back="Training"
      pages={{
        coach: {
          title: "Coach",
          content: (
            <Suspense fallback={null}>
              <CoachPage />
            </Suspense>
          ),
        },
        practice: { title: "Practice", content: <PracticePage /> },
      }}
    >
      <ListGroup>
        <PageRow
          page="coach"
          title="Coach"
          disabled={!signedIn}
          value={signedIn ? undefined : "Sign In to Use"}
          testId="setup-coach-row"
          media={
            <RowBadge colour={SETTING_BADGE.coach}>
              <Target />
            </RowBadge>
          }
        />
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
      </ListGroup>
    </ConsolePages>
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
