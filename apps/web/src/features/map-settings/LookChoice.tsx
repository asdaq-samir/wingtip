import { useId } from "react";
import { Navigation } from "lucide-react";
import { AppearanceLayerTile, SunlightLayerTile, ThemeLayerTile } from "../../components/lookPicks";
import { LayerToggle } from "../../components/LayerTile";
import SectionTitle from "../../components/SectionTitle";
import { askPositionQuietly, ownShipAvailable, useOwnShip } from "../../lib/map/position/ownShip";
import { showError } from "../../lib/problems";

/**
 * The app's look, under the layers, four tiles two by two as every
 * section of the Map card is (the owner, 2026-11-14: "every section should
 * have 4 tiles like Layers one. The fourth tile for look can be
 * position"): Theme (Wingtip, Glass Cockpit, Chart ink or Native),
 * Appearance (System, Light, Dark, or Dark + Bright) and Sunlight (Auto,
 * On or Off), each its value under its name and a tap its menu
 * (lookPicks); and Position. Theme and Appearance came from Settings' Look
 * group and Sunlight from its Display (the owner, 2026-11-14), so each
 * control has one home; the first flight's welcome draws Theme and
 * Appearance too (lookPicks).
 */
export default function LookChoice() {
  const id = useId();
  return (
    <section role="group" aria-labelledby={id} className="flex flex-col" data-testid="map-look">
      <div className="pb-1.5">
        <SectionTitle id={id}>Look</SectionTitle>
      </div>
      {/* The layers' grid (MapLayers), so every section's tiles line up. */}
      <div className="grid auto-rows-fr grid-cols-2 gap-2">
        <ThemeLayerTile />
        <AppearanceLayerTile />
        <SunlightLayerTile />
        <PositionTile />
      </div>
    </section>
  );
}

/**
 * Own ship's position on the map, the location arrow's on and off
 * (lib/map/position ownShip `enabled`), in the tint while on. On asks as
 * the first flight's welcome does (askPositionQuietly: the browser's
 * question at the tap, the map brought to the position); over plain http,
 * where the browser gives a page no position, a tap says so, as the
 * arrow's does (MyPositionButton).
 */
function PositionTile() {
  const enabled = useOwnShip((s) => s.enabled);
  const setEnabled = useOwnShip((s) => s.setEnabled);
  const turn = (on: boolean) => {
    if (!on) setEnabled(false);
    else if (ownShipAvailable()) askPositionQuietly();
    else showError("No position over this connection", "The browser gives a page the phone's position only over https.");
  };
  return <LayerToggle name="Position" glyph={Navigation} on={enabled} onChange={turn} testId="position-toggle" />;
}
