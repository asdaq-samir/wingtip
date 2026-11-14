import { useId } from "react";
import { AppearanceTile, ThemeTile } from "../../components/lookPicks";
import SectionTitle from "../../components/SectionTitle";

/**
 * The app's look, two tiles under the layers: Theme (Wingtip, Glass
 * Cockpit, Chart ink or Native) and Appearance (System, Light, Dark, or
 * Dark + Bright). They were Settings' Look group and moved to the Map
 * card at the owner's ask (2026-11-14: "Can we move the look to map
 * settings too?"), so each control has one home; the first flight's
 * welcome draws the same two (lookPicks is shared).
 */
export default function LookChoice() {
  const id = useId();
  return (
    <section role="group" aria-labelledby={id} className="flex flex-col" data-testid="map-look">
      <div className="pb-1.5">
        <SectionTitle id={id}>Look</SectionTitle>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ThemeTile />
        <AppearanceTile />
      </div>
    </section>
  );
}
