import { callEngine } from "../../lib/engine/engine";
import { mapLevel } from "../../lib/format/figures";
import type { ShownField } from "./flowLook";
import type { FlowLayer } from "./useWeatherFlow";

/** The levels a field is drawn at, by AWC's names ("sfc", "060", "max"),
 *  as the weather service lists them (layer.levels, the engine's
 *  flow_levels): the wind's and, at the same levels but Max, the
 *  temperature's; the icing's and the turbulence's; none for the others. */
export function levelsOf(layer: FlowLayer | null, field: ShownField): string[] {
  const levels = layer?.levels ?? {};
  if (field === "wind") return levels.wind ?? [];
  if (field === "temp") return (levels.wind ?? []).filter((l) => l !== "max");
  if (field === "icing") return levels.icing ?? [];
  if (field === "turb") return levels.turbulence ?? [];
  return [];
}

/** The level shown: the pilot's pick where the field has it, else the
 *  field's first (the surface, for the wind); null for a field without. */
export function levelShown(layer: FlowLayer | null, field: ShownField, picked: string): string | null {
  const levels = levelsOf(layer, field);
  return levels.includes(picked) ? picked : (levels[0] ?? null);
}

/** A field's picture at a level, as the planner names it: the surface's
 *  under the field's own name ("wind", "temp"), a level's after a dash
 *  ("wind-060", "turb-max"). */
export function fileOf(field: ShownField | "wind" | "temp", level: string | null): string {
  return level === null || level === "sfc" ? field : `${field}-${level}`;
}

/** A level as the menu and the bubble say it: "Surface", "Max", or the
 *  map's own way of writing a level, "FL060" (lib/format, the owner's
 *  pick of flight levels everywhere on the map). The level's feet are the
 *  engine's (flow_levels). */
export function levelName(id: string): string {
  if (id === "sfc") return "Surface";
  if (id === "max") return "Max";
  const levels = callEngine("flow_levels", {});
  const ft = [...levels.wind, ...levels.icing, ...levels.turbulence].find((l) => l.id === id)?.ft;
  return ft == null ? id : mapLevel(ft);
}
