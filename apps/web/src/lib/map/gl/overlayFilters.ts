import type { Map as MlMap } from "maplibre-gl";
import { useEmergencyOpen } from "../../emergencyStore";
import { usePreferences } from "../../preferences";
import { applyOverlayFilters } from "./glOverlays";

/**
 * The settings' filters on the overlay tiles (applyOverlayFilters), applied
 * now and again whenever the settings change or the emergency assistant
 * opens or closes; the unsubscribe returned. While it is open the private
 * and military fields are drawn whatever the switches say, as it may rank
 * one first (14 CFR 91.3(b): in an emergency the pilot in command lands
 * where it needs), the switches left untouched and theirs again once it
 * closes (the owner, 2026-11-13).
 */
export function watchOverlayFilters(map: MlMap): () => void {
  const apply = () => applyOverlayFilters(map, useEmergencyOpen.getState().open != null);
  apply();
  const stops = [usePreferences.subscribe(apply), useEmergencyOpen.subscribe(apply)];
  return () => stops.forEach((stop) => stop());
}
