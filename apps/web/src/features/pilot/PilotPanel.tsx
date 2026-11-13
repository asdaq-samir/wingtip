import { Suspense, lazy } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Plane, Route, Settings, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { cn } from "cn";
import type { ReactNode } from "react";
import AboutPanel from "../../components/AboutPanel";
import StatusPanel from "../../components/StatusPanel";
import LoadLogPanel from "../../components/LoadLogPanel";
import { ConsolePages, PageLink, PageRow } from "../../components/ConsolePages";
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
import { SettingsPage, type HelpPages } from "../settings";
import { FlightsPanel } from "./AccountPanels";
import { AccountFace } from "./AccountFace";
import { AccountMenu } from "./AccountMenu";
import { LogbookPanel } from "./LogbookPanel";
import MinimumsPanel from "./MinimumsPanel";
import SubscriptionPanel from "./SubscriptionPanel";
import { standing, subscriptionQuery, useSold } from "../../lib/subscription";
import PilotGuide from "./PilotGuide";
import PilotPage from "./PilotPage";
import { AirplanesPage, EmergencyGroup, TrainingPage, TrainingRow } from "./YouRows";
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
    pilot: { title: "Pilot details", content: <PilotPage /> },
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
          {/* Who the pilot is, then what is theirs, then Settings: You, as
              Apple Maps' avatar opens yours (the owner's pick, option A of
              the account canvas, 2026-11-13), where the card was Settings
              with Setup's tiles on top; the tiles are Settings' Look now. */}
          <YouHead pilot={signedIn ? pilot : null} />
          {account}
          {/* The pilot's things, a row each with where it stands, as iOS's
              Settings lists its parts: the account's greyed until there is
              one; the minimums and the checklists (in Airplanes) are this
              device's. */}
          <div data-testid="library-section">
            <ListGroup>
              <PageRow
                page="aircraft"
                title="Airplanes"
                value={aircraft.label ? shortName(aircraft.label) : undefined}
                media={
                  <RowBadge colour={SETTING_BADGE.aircraft}>
                    <Plane />
                  </RowBadge>
                }
              />
              <PageRow
                page="flights"
                title="Flights"
                disabled={!signedIn}
                value={!signedIn ? SIGNED_OUT : flights ? `${flights.length} saved` : undefined}
                media={
                  <RowBadge colour={SETTING_BADGE.flights}>
                    <Route />
                  </RowBadge>
                }
              />
              <PageRow
                page="logbook"
                title="Logbook"
                disabled={!signedIn}
                value={!signedIn ? SIGNED_OUT : hours !== undefined && entries?.length ? `${hours.toFixed(1)} h` : undefined}
                media={
                  <RowBadge colour={SETTING_BADGE.logbook}>
                    <BookOpen />
                  </RowBadge>
                }
              />
              <PageRow
                page="minimums"
                title="Minimums"
                value={settings ?? undefined}
                media={
                  <RowBadge colour={SETTING_BADGE.minimums}>
                    <ShieldCheck />
                  </RowBadge>
                }
              />
            </ListGroup>
          </div>
          <TrainingRow />
          <EmergencyGroup />
          <ListGroup>
            {/* The app's Settings, one page (features/settings): the Map
                card's gear opens the same page at its Map group. */}
            <PageRow
              page="settings"
              title="Settings"
              testId="settings-row"
              media={
                <RowBadge colour={SETTING_BADGE.settings}>
                  <Settings />
                </RowBadge>
              }
            />
            {signedIn && sold && <SubscriptionRow />}
          </ListGroup>
        </div>
      </ConsolePages>
    </>
  );
}

/** What a row kept to an account says while no one is signed in: why it
 *  is greyed, where it only looked broken (the UI audit, 2026-11-09). */
const SIGNED_OUT = "Sign In to Use";

/** The personal minimums in a few words, the ceiling and visibility
 *  first; none set, nothing. */
function minimumsWords(m: Minimums): string | null {
  const parts = [m.visibilitySm !== null ? `${m.visibilitySm} mi` : null, m.ceilingFt !== null ? feet(m.ceilingFt) : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Who is signed in, at You's top, as Apple Maps' avatar opens yours
 *  (the owner's pick, option A, 2026-11-13): their initials in a large
 *  round avatar, their name under it, and Pilot Details, the page of
 *  their details for their flight plans, with the role's menu beside it
 *  (sign out, delete). Signed out, the avatar's glyph and Sign In. */
function YouHead({ pilot }: { pilot: Pilot | null }) {
  const name = pilot ? pilot.fullName || pilot.displayName : null;
  return (
    <div role="group" aria-label="Account" className="flex flex-col items-center gap-1.5 pt-2" data-testid="setup-pill-account">
      <span
        aria-hidden="true"
        className={cn(
          "grid size-18 place-items-center rounded-full font-bold [&_svg]:size-8",
          name ? "bg-tint text-white" : "bg-foreground/8 text-tint",
          TEXT.hero,
        )}
      >
        <AccountFace name={name} />
      </span>
      <span className={cn("max-w-full truncate font-bold text-foreground", TEXT.title)}>{name ?? "You"}</span>
      <div className="flex min-h-11 items-center gap-4">
        {pilot ? (
          <PageLink page="pilot" testId="pilot-row">
            Pilot Details
          </PageLink>
        ) : (
          <Suspense fallback={null}>
            <SignInModal plain />
          </Suspense>
        )}
        <AccountMenu />
      </div>
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
        <RowBadge colour={SETTING_BADGE.subscription}>
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
