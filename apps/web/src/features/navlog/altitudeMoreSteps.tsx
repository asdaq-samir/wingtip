import type { Leg, NavLogAltitude, Totals } from "../../lib/api/types";
import { cruiseReferenceFt } from "../../lib/performance";
import { feet, flightLevel } from "../../lib/format";
import { WINDS_MODELLED, windsSource } from "../../lib/windsAloft";
import { capitalised, faaWords, suaAltitudes } from "../../lib/advisories";
import { altFt, cruiseByAltitude, describeFuel, describeSteps, describeTime, PLAN_NAME } from "../plan";
import { economicalWords } from "../plan";
import { callEngine } from "../../lib/engine/engine";
import { andList } from "../../lib/listWords";
import type { Step } from "./altitudeSteps";

/** The surface-area minimums, "1,000 ft, 3 sm" (14 CFR 91.155(c), (d)),
 *  which the planner holds every route to, the engine's
 *  (`vfr_basic_minimums`). Not the least VFR ever asks: Class G low down
 *  by day asks 1 sm and clear of clouds (91.155(a)). */
function basicMinimums(): string {
  const m = callEngine("vfr_basic_minimums", {});
  return `${altFt(m.ceiling_ft)} ft, ${m.visibility_sm} sm`;
}

/** Words set in a sentence's middle: their first letter small, unless
 *  it starts a code ("NOTAM"). */
const midSentence = (words: string) => (/^[A-Z][a-z]/.test(words) ? words.charAt(0).toLowerCase() + words.slice(1) : words);

/** The plans, how the four were made: the plan flown first in the Brief,
 *  with its time and fuel; after the rule where they are the buttons
 *  over the steps (`plansAbove`). */
export function plansStep(nav: NavLogAltitude, plansAbove: boolean, winds: Totals["winds"] | undefined): Step {
  const chosen = nav.options.find((o) => o.kind === nav.flown);
  const needOxygen = nav.options.filter((o) => o.needs_oxygen).map((o) => PLAN_NAME[o.kind].toLowerCase());
  return nav.options.length > 0
    ? {
        key: "plans",
        ...(plansAbove
          ? {
              title: `${["No", "One", "Two", "Three", "Four"][nav.options.length] ?? nav.options.length} plans${
                nav.flown === "custom"
                  ? `: flying ${altFt(nav.altitude_ft)} ft, your own`
                  : nav.flown === null
                    ? ": none flown, the winds aloft could not be read"
                    : chosen
                      ? `: flying the ${PLAN_NAME[chosen.kind].toLowerCase()}`
                      : ""
              }`,
            }
          : {
              title: nav.flown === "custom" ? "Your Own" : chosen ? `${PLAN_NAME[chosen.kind]} plan` : "No Plan",
              detail:
                nav.flown === "custom"
                  ? `${flightLevel(nav.altitude_ft)} all the way`
                  : chosen
                    ? describeSteps(chosen)
                    : "The winds aloft could not be read",
              value: chosen ? `${describeTime(chosen)} · ${describeFuel(chosen)}` : undefined,
            }),
        body: (
          <>
            Lowest and highest keep to the bottom and the top of the legal altitudes; fastest takes the winds aloft,
            {` ${windsSource(winds) ?? WINDS_MODELLED}, for the least time, and ${economicalWords(nav.options)}. `}
            {nav.options
              .map(
                (o) =>
                  `${PLAN_NAME[o.kind]}: ${describeSteps(o)}, ${describeTime(o)}, ${describeFuel(o)}` +
                  (o.climb_penalty_min != null && o.climb_penalty_min > 0
                    ? `, ${Math.round(o.climb_penalty_min)} min of it climbing`
                    : "") +
                  (o.tailwind_kt !== null
                    ? `, ${Math.abs(Math.round(o.tailwind_kt))} kt ${o.tailwind_kt >= 0 ? "tailwind" : "headwind"} on average`
                    : "") +
                  ".",
              )
              .join(" ")}
            {needOxygen.length > 0 &&
              ` The ${andList(needOxygen)} ${needOxygen.length === 1 ? "plan climbs" : "plans climb"} above the altitude where more than 30 minutes needs supplemental oxygen (14 CFR 91.211).`}
          </>
        ),
      }
    : {
        // No plans only when the winds could not be read before they were
        // made: a route with no legal altitude on some leg ends in an error
        // instead, with no altitude message at all.
        key: "plans",
        // Why, in the row itself: folded, the reason was the one thing a
        // pilot had to open the step to learn.
        title: "No Plan",
        detail: "The winds aloft could not be read",
        body: <>No plan can be made or flown without them. Try again shortly.</>,
      };
}

/** The airplane's cruise in each leg's own air, a step; none with no airplane
 *  or with legs from a planner that did not say. */
export function performanceSteps(nav: NavLogAltitude, legs: Leg[]): Step[] {
  // The airplane's cruise in each leg's own air (the engine's wingtip_flight::performance): its
  // figures are its own at the reference altitude on a standard day, and
  // each leg's are worked out for the forecast temperature at its
  // altitude. Legs from a planner that did not say have none.
  const aircraft = nav.aircraft;
  const flown = legs.filter((leg) => leg.tas_kt != null);
  const cruiseInItsAir = aircraft ? cruiseByAltitude(flown, aircraft.cruise_power_pct) : [];
  const standardDayLegs = flown.filter((leg) => leg.oat_c == null).length;
  return [
    ...(aircraft && cruiseInItsAir.length > 0
      ? [
          {
            key: "performance",
            title: "Performance in the Day's Air",
            body: (
              <>
                {`The airplane's ${aircraft.cruise_tas_kt} kt and ${aircraft.fuel_burn_gph} gph are its cruise${
                  aircraft.cruise_power_pct != null ? ` at ${aircraft.cruise_power_pct}% power` : ""
                } at ${altFt(cruiseReferenceFt())} ft on a standard day, and each leg flies them in the forecast air at its altitude:`}
                <ul className="my-1 list-disc pl-4">
                  {cruiseInItsAir.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {standardDayLegs > 0 &&
                  `No temperature is forecast near ${standardDayLegs === 1 ? "one leg" : `${standardDayLegs} legs`}, so a standard day is assumed there. `}
                {`Climbs are at the best rate${
                  aircraft.climb_rate_fpm_sea_level != null ? `, ${aircraft.climb_rate_fpm_sea_level} fpm at sea level` : ""
                } falling to 100 fpm at the service ceiling, and burn less as full throttle makes less. A model: the handbook governs.`}
              </>
            ),
          },
        ]
      : []),
  ];
}

/** What was checked as well, and does not move the numbers. */
export function checkedStep(nav: NavLogAltitude): Step {
  const s = nav.altitude_selection;
  // Under IFR the floor, the ceiling and the rule are IFR's (the
  // planner's wingtip.ifr): said in their words.
  const ifr = s.rules === "ifr";
  // Icing is a warning, not a ceiling: the planner no longer caps the
  // band at the freezing level (icing needs cloud as well as cold).
  const freezing = s.weather_unavailable.includes("freezing_level")
    ? "The freezing level could not be checked."
    : s.freezing_level_ft === null
      ? "No freezing level in range: the forecast stays above 0 °C."
      : `Freezing level ${s.freezing_level_at_or_below ? "at or below" : "at"} ${altFt(s.freezing_level_ft)} ft${
          s.icing_possible
            ? " — icing is possible at and above it: cloud or an icing AIRMET is forecast along the route."
            : ", with no cloud or icing AIRMET forecast along the route."
        }`;
  const hazards = s.weather_unavailable.includes("hazards")
    ? "SIGMETs and AIRMETs could not be checked"
    : s.hazards.length === 0
      ? "no SIGMET or AIRMET along the route"
      : `${s.hazards.length} SIGMET/AIRMET${s.hazards.length === 1 ? "" : "s"} along the route`;
  const checkedSummary = s.weather_unavailable.includes("ceiling_visibility")
    ? "forecast not checked"
    : `ceiling ${s.min_ceiling_ft === null ? "none" : feet(s.min_ceiling_ft)}, ${s.min_visibility_sm ?? "—"} sm`;
  return {
    key: "checked",
    title: `Checked as well: ${checkedSummary}`,
    body: (
      <>
        {s.weather_unavailable.includes("ceiling_visibility")
          ? `The forecast ceiling and visibility could not be checked${ifr ? ". " : ", so no altitude is kept under the clouds. "}`
          : `Forecast for the flight, its temporary changes included: ceiling ${
              s.min_ceiling_ft === null ? "none" : feet(s.min_ceiling_ft)
            }, visibility ${s.min_visibility_sm ?? "—"} sm${
              s.low_ceiling_or_visibility && !ifr ? `, below the surface-area VFR minimums (${basicMinimums()}) somewhere on the way` : ""
            }. `}
        {capitalised(hazards)}. {freezing}
      </>
    ),
  };
}

/** The special-use airspace and the transits along the route, each a step. */
export function airspaceSteps(nav: NavLogAltitude): Step[] {
  const s = nav.altitude_selection;
  const specialUse = s.special_use ?? [];
  return [
    ...(specialUse.length > 0
      ? [
          {
            key: "special-use",
            title: `Special-use airspace: ${andList(specialUse.map((a) => a.name))}`,
            body: (
              <>
                {andList(
                  specialUse.map(
                    (a) =>
                      `${a.name} (${a.kind}, ${suaAltitudes(a, { midSentence: true })}, ${a.along_track_nm} nm out${
                        a.type === "P"
                          ? ", no altitude through it"
                          : a.times_of_use
                            ? `, in use ${midSentence(faaWords(a.times_of_use))}`
                            : ""
                      })`,
                  ),
                )}
                .
                {specialUse.some((a) => a.type !== "P") &&
                  " Check whether each is active with its controlling agency or flight service before you go."}
              </>
            ),
          },
        ]
      : []),
    ...(s.weather_unavailable.includes("special_use")
      ? [
          {
            key: "special-use-unchecked",
            title: "Special-Use Airspace Not Checked",
            body: <>Look for prohibited and restricted areas and MOAs on the chart yourself.</>,
          },
        ]
      : []),
    ...(s.airspace_transits.length > 0
      ? [
          {
            key: "transits",
            // Class B takes a clearance, not a call (14 CFR 91.131(a)(1)): it was
            // headed "A radio call on the way" with the rest.
            title: `${s.airspace_transits.some((t) => t.class === "B") ? "A clearance on the way" : "A radio call on the way"}: ${andList(
              s.airspace_transits.map((t) => t.name),
            )}`,
            body: (
              <>
                Not a ceiling:{" "}
                {andList(
                  s.airspace_transits.map(
                    (t) =>
                      `${t.name} (Class ${t.class}, ${t.floor_ft_msl ? `floor ${altFt(t.floor_ft_msl)} ft` : "from the surface"}, ${t.along_track_nm} nm out, ${t.requires})`,
                  ),
                )}
                .
                {s.airspace_transits.some((t) => t.class === "B") && (
                  <>
                    {" "}
                    Class B also takes a transponder with altitude reporting and ADS-B Out (14 CFR 91.131(d)), and a private pilot
                    certificate, or a student, sport or recreational pilot's endorsement for it (91.131(b)).
                  </>
                )}
              </>
            ),
          },
        ]
      : []),
  ];
}
