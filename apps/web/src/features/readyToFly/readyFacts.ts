import type { Briefing, DataCycle } from "../../lib/api/types";
import type { EngineInput } from "../../lib/engine/engine";

/**
 * The facts Ready to fly is asked about, gathered from what the web app
 * already holds, as the engine's `ready_to_fly` takes them. Facts only:
 * whether they are enough, and how old is too old, is the engine's rule
 * (engine/crates/weather/src/ready.rs), the same on both phones.
 */
export type ReadyInput = EngineInput<"ready_to_fly">;

/** A 256-pixel chart tile's bytes, about: a 300 nm route's thousand tiles
 *  at zooms 8 to 12 are some fifteen megabytes, and a 512-pixel one
 *  about 2.7 times that (lib/map/route/keepRoute, the Chicago sheet,
 *  2026-11-06). Only for the size the download is said at. */
const TILE_BYTES = 15_000;
const DENSE_TILE_BYTES = TILE_BYTES * 2.7;

/** A chart cycle as the engine reads it, "YYYY-MM-DD": the planner names
 *  some editions "MM-DD-YYYY". Null where it is no date. */
export function editionDay(cycle: string | null | undefined): string | null {
  if (!cycle) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(cycle)) return cycle.slice(0, 10);
  const us = /^(\d{2})-(\d{2})-(\d{4})$/.exec(cycle);
  return us ? `${us[3]}-${us[1]}-${us[2]}` : null;
}

/** The megabytes a keep of `tiles` tiles comes to. */
export function downloadMb(tiles: number, dense: boolean): number {
  return (tiles * (dense ? DENSE_TILE_BYTES : TILE_BYTES)) / 1e6;
}

/** Unix seconds from an ISO time or milliseconds; null where none. */
const seconds = (at: string | number | null | undefined): number | null => {
  if (at == null || at === "") return null;
  const ms = typeof at === "number" ? at : Date.parse(at);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : null;
};

export interface ReadyParts {
  nowMs: number;
  dep: string;
  dest: string;
  routed: boolean;
  /** The airplane's profile as the plan flies it, null with none picked:
   *  never taken as a Cessna 172. */
  airplane: string | null;
  altitudeFt: number | null;
  /** The route's base chart: kept, can be, its edition and its tiles. */
  chart: { kept: boolean; canKeep: boolean; cycle: string | null; tiles: number; dense: boolean } | null;
  cycles: readonly DataCycle[];
  briefing: { data: Briefing; atMs: number } | null;
  alternate: string | null;
  notamsAtMs: number | null;
  device: { batteryPct: number | null; charging: boolean | null; location: "granted" | "denied" | "prompt" | null };
}

/** The fields the weather is asked of: the departure, the destination and
 *  the alternate filed. Each METAR's observed time and whether a TAF is
 *  in, from the briefing (its METARs and its TAF stations). */
function fields(parts: ReadyParts): NonNullable<ReadyInput["fields"]> {
  const briefing = parts.briefing?.data;
  if (!briefing) return [];
  const roles = [
    ["departure", parts.dep],
    ["destination", parts.dest],
    ["alternate", parts.alternate],
  ] as const;
  return roles
    .filter(([, ident]) => !!ident)
    .map(([role, ident]) => ({
      ident: ident!,
      role,
      metar_observed: seconds(briefing.metars[ident!]?.observed_at ?? null),
      taf: briefing.forecast.stations.some((s) => s.icaoId === ident),
    }));
}

/** The engine's input from the parts. The planner's own data (its NASR
 *  and CIFP, which the web reads through it) stands for the cycle packs a
 *  phone holds; the web cannot update them, so that fix is not offered.
 *  No receiver and no saved-for-offline fact: the web has neither. */
export function readyInput(parts: ReadyParts): ReadyInput {
  const pack = parts.cycles.find((c) => c.key === "packs") ?? parts.cycles.find((c) => c.key === "nasr");
  return {
    now: Math.floor(parts.nowMs / 1000),
    plan: { route: parts.routed && !!parts.dep && !!parts.dest, airplane: parts.airplane, altitude_ft: parts.altitudeFt },
    charts: parts.chart
      ? {
          kept: parts.chart.kept,
          can_keep: parts.chart.canKeep,
          edition: editionDay(parts.chart.cycle),
          download_mb: downloadMb(parts.chart.tiles, parts.chart.dense),
        }
      : null,
    packs: pack ? { edition: editionDay(pack.effective), can_update: false } : null,
    briefing: { fetched_at: parts.briefing ? seconds(parts.briefing.atMs) : null },
    fields: fields(parts),
    notams: { fetched_at: seconds(parts.notamsAtMs) },
    device: { battery_pct: parts.device.batteryPct, charging: parts.device.charging, location: parts.device.location },
  };
}
