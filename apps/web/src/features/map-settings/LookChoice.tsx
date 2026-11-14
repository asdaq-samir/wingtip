import { useId } from "react";
import { AppearanceLayerTile, OwnShipLayerTile, SunlightLayerTile, ThemeLayerTile } from "../../components/lookPicks";
import SectionTitle from "../../components/SectionTitle";

/**
 * The app's look, under the layers, its tiles two by two as every
 * section of the Map card is (the owner, 2026-11-14: "every section should
 * have 4 tiles like Layers one"): Theme (Wingtip, Glass Cockpit, Chart ink or Native),
 * Appearance (System, Light, Dark, or Dark + Bright), Sunlight (Auto,
 * On or Off) and Own Ship (the Airplane, a Twin, a Jet or the Arrow; the
 * owner, 2026-11-14: "Maybe replace the position with the choice of own
 * ship?"), each its value under its name and a tap its menu
 * (lookPicks). Theme and Appearance came from Settings' Look
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
        <OwnShipLayerTile />
      </div>
    </section>
  );
}
