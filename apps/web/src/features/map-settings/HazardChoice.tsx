import Segmented from "../../components/Segmented";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { callEngine } from "../../lib/engine/engine";
import { useEngineReady } from "../../lib/engine/useEngineReady";
import { feet } from "../../lib/format";
import { usePreferences, type HazardSetting } from "../../lib/preferences";

const SETTINGS: { value: HazardSetting; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
  { value: "flight", label: "In Flight" },
];

/**
 * Terrain Hazards, the map's hazard colouring (HazardGl; ForeFlight's
 * Hazard Advisor): the ground and the obstacles red within the pilot's
 * clearance of the altitude flown, amber a band under it. Off unless
 * picked, on, or on by itself in flight; its one home is this card. The
 * clearance, while it is not off, one of the engine's three, each a 14
 * CFR minimum (hazard_view's clearances_ft: 91.119(c)'s 500 ft, 91.119(b)
 * and 91.177(a)(2)(ii)'s 1,000, its default, and 91.177(a)(2)(i)'s 2,000
 * over mountains), a segmented control as a discrete setting is.
 */
export default function HazardChoice() {
  const setting = usePreferences((s) => s.hazard);
  const setSetting = usePreferences((s) => s.setHazard);
  const picked = usePreferences((s) => s.hazardClearanceFt);
  const setPicked = usePreferences((s) => s.setHazardClearanceFt);
  // The clearances are the engine's: none offered until its .wasm is there.
  const engine = useEngineReady();
  const figures = engine && setting !== "off" ? callEngine("hazard_view", { setting: "off", clearance_ft: picked }) : null;
  return (
    <ListGroup>
      <ListRow title="Terrain Hazards">
        <Segmented
          label="Terrain Hazards"
          value={setting}
          onChange={(v) => setSetting(v as HazardSetting)}
          options={SETTINGS}
          testId="hazard-setting"
        />
      </ListRow>
      {figures && (
        <ListRow title="Red Within">
          <Segmented
            label="Red Within"
            value={String(figures.clearance_ft)}
            onChange={(v) => setPicked(Number(v))}
            options={figures.clearances_ft.map((ft) => ({ value: String(ft), label: feet(ft) }))}
            testId="hazard-clearance"
          />
        </ListRow>
      )}
    </ListGroup>
  );
}
