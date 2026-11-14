import { AppearanceRow, SunlightRow, ThemeRow } from "../../components/lookPicks";
import { ListGroup } from "../../components/GroupedList";

/**
 * The app's look, under the layers: Theme (Wingtip, Glass Cockpit, Chart
 * ink or Native), Appearance (System, Light, Dark, or Dark + Bright) and
 * Sunlight (Auto, On or Off; Settings' Display until the owner's "Sunlight
 * should also move to map settings", 2026-11-14), three rows of one inset
 * grouped list, each its name and its pull-down, as
 * iOS Settings sets a choice (the owner's "How can this be better?",
 * 2026-11-14, where they were two tiles). They were Settings' Look group
 * and moved to the Map card at the owner's ask (2026-11-14: "Can we move
 * the look to map settings too?"), so each control has one home; the
 * first flight's welcome draws the same two picks as tiles (lookPicks).
 */
export default function LookChoice() {
  return (
    <div data-testid="map-look">
      <ListGroup title="Look">
        <ThemeRow />
        <AppearanceRow />
        <SunlightRow />
      </ListGroup>
    </div>
  );
}
