import type { Map as MlMap } from "maplibre-gl";
import { useEmergencyOpen } from "../../emergencyStore";
import { usePreferences } from "../../preferences";
import { applyOverlayFilters } from "./glOverlays";
import { useRouteOnly } from "../routeOnly";

/**
 * The settings' filters on the overlay tiles (applyOverlayFilters), applied
 * now and again whenever the settings change or the emergency assistant
 * opens or closes; the unsubscribe returned. While it is open the private
 * and military fields are drawn whatever the switches say, as it may rank
 * one first (14 CFR 91.3(b): in an emergency the pilot in command lands
 * where it needs), the switches left untouched and theirs again once it
 * closes (the owner, 2026-11-13). While FPL's route is open to edit the
 * map shows the route's points alone (lib/map/routeOnly).
 */
export function watchOverlayFilters(map: MlMap): () => void {
  const apply = () => applyOverlaySettings(map);
  apply();
  const stops = [usePreferences.subscribe(apply), useEmergencyOpen.subscribe(apply), useRouteOnly.subscribe(apply)];
  return () => stops.forEach((stop) => stop());
}

/** The settings' filters as they stand now, once: what a layer that hid
 *  some of the tiles' layers for a while (the 3D view's, over the chart's
 *  own tabs) gives back, so a layer the settings hide stays hidden. */
export function applyOverlaySettings(map: MlMap) {
  applyOverlayFilters(map, useEmergencyOpen.getState().open != null, useRouteOnly.getState().on);
}
