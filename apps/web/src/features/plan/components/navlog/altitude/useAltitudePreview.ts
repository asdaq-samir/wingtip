import { useState, type RefObject } from "react";
import type { AltitudeChoice, Leg, NavLogAltitude, RouteProfile } from "../../../../../lib/api/types";
import { altFt, flightLevel } from "../../../../../lib/format";
import { useFlying } from "../../../../../lib/mapChrome";
import { useOwnFix } from "../../../../../lib/map/position/ownShip";
import { clearanceAt, clearanceWords, strikeWords, type AlongPoint } from "./clearance";
import { advisorRows, flownOf, planAt } from "./plans";

/**
 * The Profile card's view model: the altitude in sight on the profile and
 * what it clears, kept apart from the one flown until the pilot taps Set
 * (the owner's pick, 2026-11-10, after ForeFlight's) -- the slider only
 * previews. In flight, Auto puts the preview at the GPS's altitude and
 * keeps it there. The Altitude Advisor's rows are the engine's.
 */
export function useAltitudePreview({
  nav: navNow,
  legs: legsNow,
  route,
  problem,
  profile,
  points,
  onAltitudeChoiceChange,
  onFlyAltitude,
  graph,
}: {
  /** The graph's box, whose CSS the slider moves as it goes. */
  graph: RefObject<HTMLDivElement | null>;
  nav: NavLogAltitude | null;
  legs: Leg[];
  route: string;
  problem: boolean;
  profile: RouteProfile | undefined;
  points: AlongPoint[];
  onAltitudeChoiceChange: (choice: AltitudeChoice) => void;
  onFlyAltitude: (feet: number, legal: boolean) => void;
}) {
  // The plan before a pick is planned anew, kept on the card till the new
  // one's altitude comes: the stream starts over, and the card went blank
  // for the second or two each pick took. Not over a route's problem, nor
  // another route.
  const [held, setHeld] = useState<{ route: string; nav: NavLogAltitude; legs: Leg[] } | null>(null);
  if (navNow && (!held || held.nav !== navNow || held.legs !== legsNow || held.route !== route))
    setHeld({ route, nav: navNow, legs: legsNow });
  const kept = !navNow && !problem && held?.route === route ? held : null;
  const nav = kept ? kept.nav : navNow;
  const legs = kept ? kept.legs : legsNow;
  const flown = flownOf(nav, legs);
  const rows = advisorRows(nav, flown);
  // The slider's rows, lowest at its foot: the engine's, not evenly spaced.
  const rising = rows.map((r) => r.altitude_ft).reverse();
  // The altitude previewed, against the one flown and the route it was
  // put there on: once another is flown or the route changes, it is gone.
  const [preview, setPreview] = useState<{ altitude: number; against: number | null; route: string } | null>(null);
  const flying = useFlying((s) => s.flying);
  const gpsFt = useOwnFix()?.altitudeFt ?? null;
  const [auto, setAuto] = useState(false);
  const autoFt = flying && auto && gpsFt !== null ? Math.round(gpsFt / 100) * 100 : null;
  const shownAt =
    autoFt ??
    (preview && preview.against === flown && preview.route === route
      ? preview.altitude
      : flown !== null && rising.includes(flown)
        ? flown
        : (rising[0] ?? null));
  const clearance = shownAt !== null ? clearanceAt(profile, shownAt, points) : null;
  // Shown as the slider goes -- the line, its words, the ground's red and
  // yellow and the strip -- by their CSS and text, nothing drawn again.
  const live = (altitude: number) => {
    const el = graph.current;
    if (!el) return;
    el.style.setProperty("--roll-ft", String(altitude));
    el.style.setProperty("--roll-on", "1");
    el.querySelector("[data-roll-label]")?.setAttribute("data-label", flightLevel(altitude));
    const base = Number(getComputedStyle(el.querySelector("[data-plot]") ?? el).getPropertyValue("--base-top")) || 10_000;
    const at = (ft: number) => String(Math.max(0, Math.min(1, 1 - ft / base)));
    const c = clearanceAt(profile, altitude, points);
    if (!c) return;
    for (const [tint, ft] of [
      ["red", c.red_from_ft],
      ["red-end", c.red_from_ft],
      ["amber", c.yellow_from_ft],
      ["amber-end", c.yellow_from_ft],
    ] as const)
      el.querySelector(`[data-tint="${tint}"]`)?.setAttribute("offset", at(ft));
    const strip = el.parentElement?.querySelector("[data-testid=ground-strip]");
    if (strip && c.least_ft !== null) {
      strip.querySelector("[data-live=clearance]")!.textContent = clearanceWords(c.least_ft, altFt);
      strip.querySelector("[data-live=strike]")!.textContent = strikeWords(c.strike_nm);
      strip.setAttribute("data-level", c.level ?? "");
    }
  };
  const rest = (altitude: number) => {
    graph.current?.style.setProperty("--roll-on", "0");
    setAuto(false);
    setPreview({ altitude, against: flown, route });
  };
  // Flown: its plan where one cruises there, else as the pilot's own, any
  // row, warned of and never limited; nothing where it is what is flown.
  const fly = (altitude: number) => {
    const plan = planAt(nav, altitude);
    setPreview(null);
    setAuto(false);
    if (plan ? plan === nav?.flown : altitude === flown) return;
    if (plan) onAltitudeChoiceChange(plan);
    else
      onFlyAltitude(
        altitude,
        rows.some((r) => r.altitude_ft === altitude && r.legal),
      );
  };
  return {
    nav,
    legs,
    flown,
    rows,
    rising,
    shownAt,
    clearance,
    live,
    rest,
    fly,
    flying: flying && gpsFt !== null,
    auto: autoFt !== null,
    setAuto,
    /** The slider's spoken value: the altitude, what it clears, its plan. */
    spoken: (altitude: number) => {
      const row = rows.find((r) => r.altitude_ft === altitude);
      const words = clearanceAt(profile, altitude, points)?.words ?? `${altFt(altitude)} ft`;
      const marks = [
        row?.fastest && "Fastest",
        row?.economical && "Most economical",
        row && !row.legal && "outside the legal altitudes",
      ].filter(Boolean);
      return `${words.replace(/ ft\b/, " feet")}${marks.length ? `, ${marks.join(", ")}` : ""}`;
    },
  };
}
