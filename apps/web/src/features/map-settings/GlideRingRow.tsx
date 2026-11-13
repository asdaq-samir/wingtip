import { tailOf } from "../../lib/aircraftChoice";
import { glideRingBlocked, setGlideRing, useGlideRingSetting } from "../../lib/map/position/glideRingSetting";
import { useGlideRatio } from "../../lib/map/position/useGlideRatio";
import { usePreferences } from "../../lib/preferences";
import SwitchRow from "../../components/SwitchRow";

/** The Map card's Glide Ring switch (MapSettingsPage, its one home): off by
 *  default, and greyed with why where no ring can be drawn -- no airplane,
 *  or none with a glide ratio. The emergency assistant draws its own. */
export default function GlideRingRow() {
  const on = useGlideRingSetting((s) => s.value);
  const aircraft = usePreferences((p) => p.aircraft);
  const ratio = useGlideRatio();
  const blocked = glideRingBlocked(!aircraft.none, tailOf(aircraft), ratio);
  return (
    <SwitchRow
      title="Glide Ring"
      description={blocked ?? undefined}
      on={on && !blocked}
      onChange={setGlideRing}
      disabled={!!blocked}
      testId="glide-ring-toggle"
    />
  );
}
