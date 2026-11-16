import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import type { RouteChip, RouteOptions } from "../../../lib/api/types";
import { duration } from "../../../lib/format";
import { callEngine } from "../../../lib/engine/engine";
import type { RouteWay } from "../../../lib/map/route/routeWays";
import { useRouteLineOpen } from "../lib/routeLine";
import { gridScale, sameStops, wayTime } from "../lib/routeWays";
import type { useRouteEdits } from "./useRouteEdits";
import type { Browsing, FuelCard } from "./useRouteWays";

/** No ways on the chart: one array for good, so the map's memo holds. */
const NO_WAYS: RouteWay[] = [];
const NO_CHIPS: RouteChip[] = [];

/** Where along each way its chip sits, a share of its length, by the
 *  way's place among all those offered. */
const WAY_CHIP_SHARES = [0.2, 0.4, 0.6, 0.8];

/** A card of FPL's route line: a way, its time, miles and fuel, and what
 *  it meets. */
interface WayCard {
  key: string;
  label: string;
  warning: string | null;
  time: string | null;
  nm: number | null;
  gal: number | null;
}

/** What a chip's way meets, said on it: the worst it crosses, the
 *  engine's words and ranking (route_way_warning, the same rule as each
 *  route option's `warning`) -- a prohibited area or a TFR, a restricted
 *  area, storms, high ground, a SIGMET, no fuel stop in reach, other
 *  weather, then a warning area, a MOA and an alert area (14 CFR 91.133,
 *  91.137-91.145; AIM 3-4). From the chip's own crossings, so the route
 *  as typed says it too. The web ranked its own copy (wayWarning), which
 *  named no restricted area or MOA. */
function wayWarning(hazards: RouteOptions["hazards"], crosses: number[]): string | null {
  return callEngine("route_way_warning", { kinds: crosses.flatMap((i) => (hazards[i] ? [hazards[i].kind] : [])) });
}

/**
 * The route line's cards (useRouteLine), each way's whole time as its line
 * on the chart says it -- the route as typed by its own nav log's
 * (`minutes` and `ground`), the planner's ways on the route's clock
 * (gridScale), their stops' times in them -- and its miles and fuel, as
 * ForeFlight's Route Advisor and Garmin's Routes give them, at the owner's
 * word (2026-11-08): the route as typed by its own nav log's totals
 * (`typedNm`, `typedGal`), a way by the planner's answer for it
 * (RouteOption's distance_nm and fuel_gal), none worked out here. "None"
 * and "Over Land" at 1h 14m each told a pilot nothing apart (the FPL
 * audit's A15). Null where there are not two cards to pick between.
 */
export function wayCards({
  chips,
  routeWays,
  lineKey,
  minutes,
  ground,
  typedNm,
  typedGal,
}: {
  chips: RouteChip[];
  routeWays: RouteOptions | undefined;
  /** The chip picked. */
  lineKey: string;
  minutes: number | null;
  ground: number;
  typedNm: number | null;
  typedGal: number | null;
}): WayCard[] | null {
  const hazards = routeWays?.hazards ?? [];
  const scale = gridScale(routeWays, minutes);
  const wayOf = (chip: RouteChip) =>
    chip.key === "fuel" ? routeWays?.own : routeWays?.options.find((o) => sameStops(o.stops, chip.stops));
  const timeOf = (chip: RouteChip): string | null => {
    if (chip.key === "none") return minutes === null ? null : duration(minutes + ground);
    const way = wayOf(chip);
    return way ? wayTime(way, scale) : null;
  };
  const figuresOf = (chip: RouteChip) => {
    if (chip.key === "none") return { nm: typedNm, gal: typedGal };
    const way = wayOf(chip);
    return { nm: way?.distance_nm ?? null, gal: way?.fuel_gal ?? null };
  };
  const typed = chips.find((c) => c.key === "none");
  const cards = chips
    .map((c) => ({
      key: c.key,
      label: c.key === "none" ? "As typed" : c.label,
      warning: wayWarning(hazards, c.crosses ?? []),
      time: timeOf(c),
      ...figuresOf(c),
    }))
    // A way no different from the route as typed -- its time, and its
    // miles within one -- is not offered beside it (the owner's word on
    // A15), unless it is the one picked.
    .filter(
      (card) =>
        card.key === "none" ||
        card.key === lineKey ||
        !typed ||
        !(card.time === timeOf(typed) && card.nm != null && typedNm != null && Math.abs(card.nm - typedNm) < 1),
    );
  return cards.length < 2 ? null : cards;
}

/**
 * FPL's route line (usePlanWorkspace; the owner's redesign, 2026-10-26:
 * "make it more like the runway folding with the route symbol, and no
 * need for accept or not buttons. You can simply have none in the
 * beginning"): the planner's chips (RouteOptions.chips), "None" the route
 * as typed. A chip tapped is the route at once, planned; the route as
 * typed kept (`browsing`, useRouteWays) and the chips asked for from it,
 * so "None" puts it back. A change of the route by hand ends it. With the
 * ways drawn on the chart while the line is open.
 */
export function useRouteLine({
  routeWays,
  waysStale = false,
  browsing,
  setBrowsing,
  chosenKey,
  vfrRoute,
  stops,
  fuelParam,
  ownWithFuel,
  ownMinutes,
  ownGround,
  ownNm,
  ownGal,
  setStops,
  flightRules,
}: {
  routeWays: RouteOptions | undefined;
  /** The ways are the last airplane's or time's, kept while the new ones
   *  come (useRouteWays): drawn dimmed, not to be picked. */
  waysStale?: boolean;
  browsing: Browsing | null;
  setBrowsing: Dispatch<SetStateAction<Browsing | null>>;
  /** The route's ends the browsing is kept under (useRouteWays). */
  chosenKey: string;
  vfrRoute: boolean;
  /** The route's stops as typed. */
  stops: string[];
  /** The fuel stops the address names (`fuel`). */
  fuelParam: string | null;
  ownWithFuel: FuelCard | null;
  ownMinutes: number | null;
  ownGround: number;
  ownNm: number | null;
  ownGal: number | null;
  setStops: ReturnType<typeof useRouteEdits>["setStops"];
  flightRules: string;
}) {
  const chips = routeWays?.chips ?? NO_CHIPS;
  const lineKey = browsing ? (chips.find((c) => c.key !== "none" && sameStops(c.stops, stops))?.key ?? "none") : "none";
  const applyChip = useCallback(
    (key: string) => {
      if (key === "none") {
        if (browsing) {
          setBrowsing(null);
          // The typed route's own picks kept (keepLists): its stops' runways,
          // approaches, holds and altitudes, which a way that skipped a stop
          // would otherwise have pruned.
          setStops(browsing.stops, browsing.fuel, true);
        }
        return;
      }
      const chip = chips.find((c) => c.key === key);
      if (!chip) return;
      if (!browsing) {
        setBrowsing({
          key: chosenKey,
          stops,
          fuel: (fuelParam ?? "").split(",").filter(Boolean),
          withFuel: ownWithFuel,
          ownMinutes,
          ownGround,
          ownNm,
          ownGal,
          ways: chips.map((c) => c.stops),
        });
      }
      setStops(chip.stops, chip.fuel, true);
    },
    [browsing, chips, chosenKey, stops, fuelParam, ownWithFuel, ownMinutes, ownGround, ownNm, ownGal, setStops, setBrowsing],
  );
  // The rules turned to IFR on a chip: the route as typed is the route
  // (the planner's ways are VFR's).
  useEffect(() => {
    // A write to the address, once, as the rules turn: not a render's state.
    if (flightRules !== "vfr" && browsing) applyChip("none");
  }, [flightRules, browsing, applyChip]);
  // What a chip's way meets, said on it in amber, its time, miles and fuel
  // (wayCards).
  const routeLine = useMemo(() => {
    if (!vfrRoute || chips.length < 2) return null;
    const cards = wayCards({
      chips,
      routeWays,
      lineKey,
      minutes: browsing ? browsing.ownMinutes : ownMinutes,
      ground: browsing ? browsing.ownGround : ownGround,
      typedNm: browsing ? browsing.ownNm : ownNm,
      typedGal: browsing ? browsing.ownGal : ownGal,
    });
    return cards ? { chips: cards, picked: lineKey, onPick: applyChip, unchecked: routeWays?.unchecked ?? [], stale: waysStale } : null;
  }, [vfrRoute, chips, routeWays, lineKey, applyChip, browsing, ownMinutes, ownGround, ownNm, ownGal, waysStale]);

  // The chips' ways on the chart beside the course while the line is open,
  // each its time on its chip, the one picked solid (the owner's "I want
  // all routes drawn including mine", 2026-10-25); folded, the course alone.
  const lineOpen = useRouteLineOpen((st) => st.open);
  const wayLines = useMemo((): RouteWay[] => {
    if (!lineOpen || !routeLine || !routeWays) return NO_WAYS;
    const minutes = browsing ? browsing.ownMinutes : ownMinutes;
    const ground = browsing ? browsing.ownGround : ownGround;
    const scale = gridScale(routeWays, minutes);
    const lines: RouteWay[] = [];
    for (const chip of chips) {
      if (chip.key === "none") {
        if (routeWays.current_path?.length) {
          lines.push({
            key: "own",
            path: routeWays.current_path as [number, number][],
            name: chip.label,
            label: minutes === null ? "" : duration(minutes + ground),
          });
        }
        continue;
      }
      // By its stops, as the planner made the chip: a way is the best of
      // several kinds, its own `kind` only the first of them.
      const way = chip.key === "fuel" ? routeWays.own : routeWays.options.find((o) => sameStops(o.stops, chip.stops));
      if (way) lines.push({ key: chip.key, path: way.path as [number, number][], label: wayTime(way, scale) ?? "", name: chip.label });
    }
    // Each chip where it is whichever others are drawn, by its place among
    // all of them (it jumped along its line as another went).
    return lines.map((line, i) => ({ ...line, share: WAY_CHIP_SHARES[i % WAY_CHIP_SHARES.length] }));
  }, [lineOpen, routeLine, routeWays, chips, browsing, ownMinutes, ownGround]);
  // A way's line or chip on the chart tapped: its chip picked.
  const pickWay = useCallback((key: string) => applyChip(key === "own" ? "none" : key), [applyChip]);
  return { lineKey, routeLine, wayLines, pickWay };
}
