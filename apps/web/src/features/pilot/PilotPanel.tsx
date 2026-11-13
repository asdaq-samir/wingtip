import { Suspense, lazy } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Plane, Route, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { cn } from "cn";
import type { ReactNode } from "react";
import AboutPanel from "../../components/AboutPanel";
import StatusPanel from "../../components/StatusPanel";
import LoadLogPanel from "../../components/LoadLogPanel";
import { ConsolePages, PageRow } from "../../components/ConsolePages";
import { useOpenPage } from "../../components/consolePagesContext";
import { Button } from "../../components/ui/button";
import EmptyState from "../../components/EmptyState";
import { ListGroup } from "../../components/GroupedList";
import { RowBadge } from "../../components/RowBadge";
import { SETTING_BADGE } from "../../lib/rowBadges";
import type { Pilot } from "../../lib/api/types";
import { api } from "../../lib/api/client";
import { feet } from "../../lib/format";
import { flightsQuery, pilotQuery } from "../../lib/queryClient";
import { shortName } from "../../lib/aircraftChoice";
import { usePreferences } from "../../lib/preferences";
import type { Minimums } from "../../lib/minimums";
import { TEXT } from "../../lib/text";
import { useDevMode } from "../../hooks/use-dev-mode";
import { SettingsPage, type HelpPages } from "../settings";
import { FlightsPanel } from "./AccountPanels";
import { AccountFace } from "./AccountFace";
import { LogbookPanel } from "./LogbookPanel";
import MinimumsPanel from "./MinimumsPanel";
import SubscriptionPanel from "./SubscriptionPanel";
import { standing, subscriptionQuery, useSold } from "../../lib/subscription";
import PilotGuide from "./PilotGuide";
import PilotPage from "./PilotPage";
import { AirplanesPage, EmergencyRow, TrainingPage, TrainingRow } from "./YouRows";
import TabPage, { TAB_PAGE_GAP } from "../../components/TabPage";

// Loaded when it is drawn, as PaidPrompt does: imported here it put the
// sign-in sheet in the first load for every pilot already signed in.
const SignInModal = lazy(() => import("../../components/SignInModal"));

/** Who is signed in, or why nobody is: null signed out, "loading"
 *  while the check is in flight, "error" when it failed. */
type PilotState = Pilot | null | "loading" | "error";

/** The developer's own pages in Settings' Help & About: the stack's
 *  status, and the guide to training the model in place of the planner's
 *  guide. */
export interface DevPages {
  status: ReactNode;
  guide: ReactNode;
}

function Personal({
  pilot,
  dev,
}: {
  pilot: PilotState;
  /** The developer's: its Status and its own Guide. */
  dev?: DevPages;
}) {
  // The airplane picked for planning, for a logbook entry's, and said on
  // its row.
  const aircraft = usePreferences((s) => s.aircraft);
  const minimums = usePreferences((s) => s.minimums);
  const signedIn = pilot !== "loading" && pilot !== "error" && pilot !== null;
  // Pilot Details holds the role's menu, the developer's switch signed out too.
  const devAllowed = useDevMode().allowed;
  // While the sign-in is checked, or where it could not be, said under
  // the head (signed out, its way in is the head's own Sign In).
  const account =
    pilot === "loading" ? (
      <p role="status" className={cn("px-1 text-center text-muted-foreground", TEXT.note)}>
        Checking your sign-in…
      </p>
    ) : pilot === "error" ? (
      <EmptyState icon={<UserRound />} title="Sign-in Unknown">
        Your sign-in status could not be checked.
      </EmptyState>
    ) : null;
  const sold = useSold();
  // Each of the pilot's things with where it stands at its row's end, at
  // the owner's pick (T3): asked for only signed in, as the rows open to
  // nothing otherwise.
  const { data: flights } = useQuery({ ...flightsQuery, enabled: signedIn });
  const { data: entries } = useQuery({ queryKey: ["logbook"], queryFn: api.logbook.list, enabled: signedIn, meta: { silent: true } });
  const hours = entries?.reduce((sum, e) => sum + (e.totalHours ?? 0), 0);
  const settings = minimumsWords(minimums);
  // Settings' Help & About: how old the plan's data is, and what is kept
  // through a dropped connection, for every pilot (the owner, 2026-11-04),
  // a developer's with the stack's own status under it; when the map's
  // layers showed at this device's loads (lib/loadLog, 2026-11-05); the
  // guide; about.
  const help: HelpPages = {
    guide: { title: "Guide", content: dev ? dev.guide : <PilotGuide /> },
    status: {
      title: "Status",
      content: dev ? (
        <div className="space-y-5">
          <StatusPanel />
          {dev.status}
        </div>
      ) : (
        <StatusPanel />
      ),
    },
    log: { title: "Log", content: <LoadLogPanel /> },
    about: { title: "About", content: <AboutPanel /> },
  };
  const pages = {
    aircraft: { title: "Airplanes", content: <AirplanesPage signedIn={signedIn} /> },
    flights: { title: "Flights", content: <FlightsPanel /> },
    logbook: { title: "Logbook", content: <LogbookPanel aircraft={shortName(aircraft.label)} /> },
    minimums: { title: "Minimums", content: <MinimumsPanel /> },
    training: { title: "Training", content: <TrainingPage signedIn={signedIn} /> },
    settings: { title: "Settings", content: <SettingsPage help={help} /> },
    subscription: { title: "Subscription", content: <SubscriptionPanel /> },
    pilot: { title: "Pilot Details", content: <PilotPage /> },
  };
  return (
    <>
      {/* Keyed on being signed out so a page open when the pilot signs out,
          or the session ends, goes back to the list: its panel would fetch
          signed out and show 401s with no word of why. "loading" is left
          out of the key, so the session check finishing does not throw
          away Minimums, which needs no sign-in, or an edit in it. */}
      <ConsolePages key={pilot === null || pilot === "error" ? "out" : "in"} back="You" pages={pages}>
        <div className={cn("flex flex-col", TAB_PAGE_GAP)}>
          {/* Who the pilot is, then one list of what is theirs and
              Settings by the gear, as Apple Maps' account card is (the owner's
              screenshot of iOS 27, 2026-11-13): the avatar, the name and
              the address over a single inset group, each row a round
              badge, its name, where it stands at its end and the chevron. */}
          <YouHead pilot={signedIn ? pilot : null} />
          {account}
          {/* The account's rows greyed until there is one, with no word of
              their own: the head's one Sign In says it (the owner,
              2026-11-13: "Instead of saying you, just say sign in once").
              The minimums and the checklists (in Airplanes) are this
              device's. */}
          <div data-testid="library-section">
            <ListGroup glass>
              {/* Pilot Details, with the role's menu in it (sign out,
                  export, delete), where it sat beside the name: the
                  developer's switch too, signed out. */}
              <PageRow
                page="pilot"
                title="Pilot Details"
                testId="pilot-row"
                disabled={!signedIn && !devAllowed}
                value={signedIn ? (pilot.homeBase ?? undefined) : undefined}
                media={
                  <RowBadge colour={SETTING_BADGE.pilot} round>
                    <UserRound />
                  </RowBadge>
                }
              />
              <PageRow
                page="aircraft"
                title="Airplanes"
                value={aircraft.label ? shortName(aircraft.label) : undefined}
                media={
                  <RowBadge colour={SETTING_BADGE.aircraft} round>
                    <Plane />
                  </RowBadge>
                }
              />
              <PageRow
                page="flights"
                title="Flights"
                disabled={!signedIn}
                value={signedIn && flights ? `${flights.length} saved` : undefined}
                media={
                  <RowBadge colour={SETTING_BADGE.flights} round>
                    <Route />
                  </RowBadge>
                }
              />
              <PageRow
                page="logbook"
                title="Logbook"
                disabled={!signedIn}
                value={signedIn && hours !== undefined && entries?.length ? `${hours.toFixed(1)} h` : undefined}
                media={
                  <RowBadge colour={SETTING_BADGE.logbook} round>
                    <BookOpen />
                  </RowBadge>
                }
              />
              <PageRow
                page="minimums"
                title="Minimums"
                value={settings ?? undefined}
                media={
                  <RowBadge colour={SETTING_BADGE.minimums} round>
                    <ShieldCheck />
                  </RowBadge>
                }
              />
              <TrainingRow />
              <EmergencyRow />
              {signedIn && sold && <SubscriptionRow />}
            </ListGroup>
          </div>
        </div>
      </ConsolePages>
    </>
  );
}

/** The personal minimums in a few words, the ceiling and visibility
 *  first; none set, nothing. */
function minimumsWords(m: Minimums): string | null {
  const parts = [m.visibilitySm !== null ? `${m.visibilitySm} mi` : null, m.ceilingFt !== null ? feet(m.ceilingFt) : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Who is signed in, at You's top, as Apple Maps' account card heads
 *  itself (the owner's screenshot, 2026-11-13): their initials in a large
 *  round avatar, their name in large bold under it and the address
 *  smaller in grey under that, as Apple Maps' card has it (the owner,
 *  2026-11-13: "the name bigger and then below it smaller email"). An
 *  address is never the name: an email sign-in's display name is the
 *  address itself, and where there is no name the large line asks for
 *  one, opening Pilot Details at its Name. Signed out, the avatar's glyph
 *  and, in the name's place, Sign In. */
function YouHead({ pilot }: { pilot: Pilot | null }) {
  const given = pilot ? pilot.fullName || pilot.displayName : null;
  const name = given && given !== pilot?.email && !given.includes("@") ? given : null;
  const address = pilot?.email ?? (given !== name ? given : null);
  // Pilot Details as its row opens it, its close back to You.
  const openPage = useOpenPage();
  return (
    <div role="group" aria-label="Account" className="flex flex-col items-center gap-1 pt-6" data-testid="setup-pill-account">
      <span
        aria-hidden="true"
        className={cn(
          "mb-2 grid size-18 place-items-center rounded-full font-bold [&_svg]:size-8",
          name ? "bg-tint text-white" : "bg-foreground/8 text-tint",
          TEXT.hero,
        )}
      >
        <AccountFace name={name} />
      </span>
      {!pilot ? (
        // Signed out, the large line is the way in, said once: no "You"
        // over a link of its own (the owner, 2026-11-13).
        <div className="flex min-h-11 items-center">
          <Suspense fallback={null}>
            <SignInModal hero />
          </Suspense>
        </div>
      ) : name ? (
        <span className={cn("max-w-full truncate font-bold tracking-tight text-foreground", TEXT.hero)} data-testid="you-name">
          {name}
        </span>
      ) : (
        <Button
          variant="link"
          className={cn(
            "relative h-auto max-w-full truncate p-0 font-bold tracking-tight after:absolute after:-inset-y-2 after:inset-x-0",
            TEXT.hero,
          )}
          onClick={() => openPage("pilot")}
          data-testid="you-name"
        >
          Add Your Name
        </Button>
      )}
      {address && (
        <span className={cn("max-w-full truncate text-muted-foreground", TEXT.detail)} data-testid="you-address">
          {address}
        </span>
      )}
    </div>
  );
}

/** The Subscription page's row, with what the pilot has in a few words. */
function SubscriptionRow() {
  const { data: subscription } = useQuery(subscriptionQuery);
  return (
    <PageRow
      page="subscription"
      title="Subscription"
      value={subscription ? standing(subscription) : undefined}
      media={
        <RowBadge colour={SETTING_BADGE.subscription} round>
          <Sparkles />
        </RowBadge>
      }
    />
  );
}

/**
 * You, the pilot's console, opened from the avatar on the planner
 * (AccountButton): who they are, their airplanes, flights, logbook,
 * minimums, training and the emergency assistant, then Settings and the
 * subscription. Shared with the developer's console. Not the nav log or
 * the briefing: those are the panel over the map.
 */
export function PilotPanel({
  dev,
}: {
  /** The developer's, at the owner's pick of the dev page's redesign:
   *  the pilot's, its Status and Guide the developer's, where it was a
   *  console of tabs of its own (Guide, Status, Account). */
  dev?: DevPages;
} = {}) {
  const { data: pilot, isLoading, isError } = useQuery(pilotQuery);
  const pilotState: PilotState = isLoading ? "loading" : (pilot ?? (isError ? "error" : null));
  // One page, no tabs over it: who is signed in and their rows, each a
  // row that opens its page. A tab's page as the others' are (TabPage),
  // with no head: its first section where their search bars start.
  return (
    <TabPage testId="setup-page" headless>
      <Personal pilot={pilotState} dev={dev} />
    </TabPage>
  );
}
