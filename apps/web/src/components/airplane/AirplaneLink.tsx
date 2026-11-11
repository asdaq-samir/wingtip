import { tailOf } from "../../lib/aircraftChoice";
import type { FigureKey } from "../../lib/airplane/figures";
import { openAirplaneProfile } from "../../lib/airplane/profileStore";
import { usePreferences } from "../../lib/preferences";
import { Button } from "../ui/button";
import { LINK } from "./link";

/** "Edit N123AB", beside the airplane figures a section shows: its profile
 *  opened on `focus` (features/airplane), where the figures are set; none
 *  for an airplane with no N-number. */
export function AirplaneLink({ focus = null, testId }: { focus?: FigureKey | null; testId?: string }) {
  const tail = usePreferences((p) => tailOf(p.aircraft));
  if (!tail) return null;
  return (
    <Button variant="link" size="sm" className={LINK} onClick={() => openAirplaneProfile(tail, focus)} data-testid={testId}>
      Edit {tail}
    </Button>
  );
}
