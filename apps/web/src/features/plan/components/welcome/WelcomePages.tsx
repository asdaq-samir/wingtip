import { MapPin, Plane } from "lucide-react";
import AirportField from "../../../../components/AirportField";
import { ListChoices, ListGroup, ListRow } from "../../../../components/GroupedList";
import Segmented from "../../../../components/Segmented";
import { Button } from "../../../../components/ui/button";
import type { FlightRules } from "../../../../lib/preferences";
import { NONE, type WelcomeModel } from "../../hooks/useWelcome";

const BIG = "h-12 rounded-(--radius-control) font-semibold";

/** The welcome's page for its step: what it asks, each answer kept at once. */
export function WelcomePage({ vm }: { vm: WelcomeModel }) {
  switch (vm.step) {
    case "airplane":
      return (
        <ListChoices value={vm.airplane} onChange={vm.pickAirplane} label="Airplane">
          <ListGroup>
            <ListRow radio={NONE} title="No Airplane" data-testid="welcome-no-airplane" />
            {vm.airplanes.map((a) => (
              <ListRow key={a.value} radio={a.value} title={a.label} />
            ))}
          </ListGroup>
        </ListChoices>
      );
    case "home":
      return (
        <AirportField
          label="Home Airport"
          placeholder="Airport, town or ident"
          icon={MapPin}
          picked={vm.home}
          onPick={(airport) => {
            if (airport) vm.setHome(airport);
          }}
          testId="welcome-home"
        />
      );
    case "rules":
      return (
        <Segmented
          label="Flight rules"
          value={vm.rules}
          onChange={(v) => vm.setRules(v as FlightRules)}
          testId="welcome-rules"
          className="w-full [&>*]:flex-1"
          options={[
            { value: "vfr", label: "VFR" },
            { value: "ifr", label: "IFR" },
          ]}
        />
      );
    case "location":
      return (
        <div className="grid gap-2">
          <Button type="button" size="lg" className={BIG} onClick={vm.allowLocation} data-testid="welcome-allow-location">
            Allow
          </Button>
          <Button type="button" variant="ghost" onClick={vm.next} data-testid="welcome-not-now">
            Not Now
          </Button>
        </div>
      );
    case "ready":
      return (
        <div className="grid gap-2">
          <Button type="button" size="lg" className={BIG} onClick={vm.openSample} data-testid="welcome-sample">
            <Plane aria-hidden />
            Open Sample Flight
          </Button>
          <Button type="button" variant="ghost" onClick={vm.planOwn} data-testid="welcome-own">
            Plan My Own
          </Button>
        </div>
      );
  }
}
