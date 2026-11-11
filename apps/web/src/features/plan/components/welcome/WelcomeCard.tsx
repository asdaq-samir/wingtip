import { Suspense, lazy } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Plane, Search } from "lucide-react";
import { cn } from "cn";
import { SheetCard } from "../../../../components/SheetCard";
import { ListChoices, ListGroup, ListRow } from "../../../../components/GroupedList";
import { Button } from "../../../../components/ui/button";
import { pilotQuery } from "../../../../lib/queryClient";
import { TEXT } from "../../../../lib/text";
import { NONE, useWelcome } from "../../hooks/useWelcome";
import type { RouteParts } from "../RouteBox";

// Only drawn signed out, and only here: its own chunk, as everywhere.
const SignInModal = lazy(() => import("../../../../components/SignInModal"));

const BIG = "h-12 rounded-(--radius-control) font-semibold";

/**
 * The welcome as one short card over the map (docs/design/web.md §14),
 * where it was a tour of five pages: what Wingtip is in one line; the
 * airplane, optional, No Airplane until one is picked (decision 0011) --
 * leaving it is the skip; Plan a Flight, filled, the primary, which puts
 * the pilot in the one search; the sample flight; the location with why,
 * asked only on a tap; and Sign In while signed out. A card in the map's
 * sheet over the search, with its ✕, on a phone as in a desktop's side
 * panel, by the one card rule (the owner, 2026-11-10), where on a phone it
 * was a dimmed sheet over the page: no modal, the map usable. Its head
 * takes the focus as it opens (the APG dialog's static title), so a screen
 * reader starts at the welcome. Escape or the close leaves the map ready,
 * the welcome seen.
 */
export default function WelcomeCard({ onPlan, onOpened }: { onPlan: (parts: RouteParts) => void; onOpened: () => void }) {
  const vm = useWelcome({ onPlan, onOpened });
  const { data: pilot, isLoading } = useQuery(pilotQuery);
  return (
    <SheetCard
      title="Welcome to Wingtip Maps"
      onClose={vm.skip}
      testId="welcome"
      description="The FAA chart, your route, its nav log and its Brief, for VFR and IFR."
    >
      <div className="grid gap-4" data-testid="welcome-card">
        <ListChoices value={vm.airplane} onChange={vm.pickAirplane} label="Your airplane, optional">
          <ListGroup title="Your Airplane (Optional)">
            <ListRow radio={NONE} title="No Airplane" data-testid="welcome-no-airplane" />
            {vm.airplanes.map((a) => (
              <ListRow key={a.value} radio={a.value} title={a.label} />
            ))}
          </ListGroup>
        </ListChoices>
        <div className="grid gap-2">
          <Button type="button" size="lg" className={BIG} onClick={vm.planFlight} data-testid="welcome-plan">
            <Search aria-hidden />
            Plan a Flight
          </Button>
          <Button type="button" variant="outline" size="lg" className={BIG} onClick={vm.openSample} data-testid="welcome-sample">
            <Plane aria-hidden />
            Open Sample Flight
          </Button>
          {vm.askLocation && (
            <Button type="button" variant="ghost" onClick={vm.allowLocation} data-testid="welcome-allow-location">
              <MapPin aria-hidden />
              Show My Location
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={vm.skip} data-testid="welcome-skip">
            Skip
          </Button>
        </div>
        {vm.askLocation && (
          <p className={cn("text-center text-muted-foreground", TEXT.note)}>
            Your location plans from where you are and shows your airplane on the chart.
          </p>
        )}
        {!isLoading && !pilot && (
          <p className={cn("text-center text-muted-foreground", TEXT.note)} data-testid="welcome-sign-in">
            Have an account?{" "}
            <Suspense fallback={null}>
              <SignInModal inline />
            </Suspense>
          </p>
        )}
      </div>
    </SheetCard>
  );
}
