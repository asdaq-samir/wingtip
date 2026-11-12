import { useState } from "react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { ACTION } from "../../lib/cardActions";
import { useRadioActions } from "../../lib/atcRadio";
import { usePointActions } from "../../lib/map/cards/pointActions";
import { TEXT } from "../../lib/text";
import type { EmergencyModel } from "./useEmergency";
import { FieldError } from "../../components/ui/field";

/**
 * Direct To the field picked -- the engine's best until the pilot picks
 * another -- first under the title and filled: the screen's one primary
 * action (docs/design/web.md §8), the next Tab stop after the title the
 * sheet opens on. No confirm step: in an emergency the route is changed at
 * once, and Undo is the route's own. With a route the map's Direct To
 * (lib/map/cards/pointActions) flies it from own ship and on along the
 * route; with none the radio's (lib/atcRadio), which plans from own ship
 * to the field. Why it could not is said here, on the button's row, never
 * in a toast.
 */
export default function DirectToField({ vm }: { vm: EmergencyModel }) {
  const { picked } = vm;
  const pointDirect = usePointActions((s) => s.directTo);
  const radioDirect = useRadioActions((s) => s.directTo);
  const [why, setWhy] = useState<string | null>(null);
  if (!picked) return null;
  const go = async () => {
    setWhy(null);
    if (pointDirect) {
      pointDirect({ ident: picked.ident, lat: picked.lat, lon: picked.lon });
      vm.close();
      return;
    }
    if (!radioDirect) {
      setWhy("Direct To needs the planner open behind this sheet.");
      return;
    }
    const failed = await radioDirect(picked.ident);
    if (failed) setWhy(failed);
    else vm.close();
  };
  const Icon = ACTION.directTo.icon;
  return (
    <div className="grid gap-1">
      <Button size="lg" className="w-full justify-center gap-2" onClick={() => void go()} data-testid="emergency-direct-to">
        <Icon className="size-5" aria-hidden />
        {ACTION.directTo.label} {picked.ident}
      </Button>
      {why && (
        <FieldError className={cn("text-destructive-ink", TEXT.note)} data-testid="emergency-direct-to-why">
          {why}
        </FieldError>
      )}
    </div>
  );
}
