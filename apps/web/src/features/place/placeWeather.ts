import type { AirportPlace } from "../../lib/api/types";
import { compassPoint } from "../../lib/compass";
import { feet, miles, nm } from "../../lib/format";
import { placeWind } from "./placeWind";
import { WORDING } from "../../lib/wording/generated/wording";

/**
 * What an airport's card says of its weather, from the field's own answer
 * or, before it is in, from what the map knew of it: its report, the
 * flight category the head's chip shows, and the line at the top of its
 * Weather tab.
 */
export function placeWeather(place: AirportPlace | undefined, known: { category: string | null } | null) {
  const metar = place?.metar ?? null;
  const weather = place
    ? { status: place.weather_unavailable ? "unavailable" : metar ? "reported" : "no-report", category: metar?.flight_category ?? null }
    : known && { status: known.category ? "reported" : "no-report", category: known.category };
  // A field with no report of its own: the nearest station's within 30
  // nm (wingtip.weather.nearest_report), at the pilot's ask -- its category
  // the card's badge, "≈", only within the ten statute miles a report is
  // said of (`near`).
  const nearby = place && !metar ? (place.nearby_metar ?? null) : null;
  const nearbyCategory = nearby?.metar.flight_category ?? null;
  const nearCategory = nearby?.near ? nearbyCategory : null;
  // And the weather the National Weather Service's Gridded LAMP models at
  // the field itself for the hour (wingtip.glmp), at the pilot's ask: the
  // badge's before a near station's, the model being of this field.
  const modelled = place && !metar ? (place.modelled_weather ?? null) : null;
  // A flight category only: its own, or with none the modelled one or the
  // nearest station's, marked "≈" -- and none at all where neither is
  // had, the weather's line saying why.
  const approximate = modelled
    ? { category: modelled.flight_category, said: "modelled for this field by the National Weather Service, not a report" }
    : nearCategory
      ? { category: nearCategory, said: `from the report of ${nearby?.ident}, another station, not this field's own` }
      : null;
  const category = weather?.category ?? approximate?.category ?? null;
  // The weather in a line at the top of its tab where there is no
  // forecast to say, as a pilot reads a report first: the wind, the
  // visibility and the ceiling (the lowest broken or overcast layer, 14
  // CFR 1.1), and how old it is; with none of its own, the model's or the
  // nearest station's, said as such.
  const weatherLine = metar
    ? [
        placeWind(metar),
        metar.visibility_sm != null ? miles(metar.visibility_sm, metar.visibility_plus) : null,
        metar.ceiling_ft == null ? WORDING.noCeiling : `Ceiling ${feet(metar.ceiling_ft)}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : modelled
      ? `Modelled: ${modelled.visibility_sm >= 10 ? "10+ sm" : miles(modelled.visibility_sm)} · ${modelled.ceiling_ft == null ? "no ceiling" : `ceiling ${feet(modelled.ceiling_ft)}`}`
      : nearby
        ? `Nearest report ${nearby.ident}, ${nm(nearby.distance_nm)} ${compassPoint(nearby.bearing_deg)}`
        : place?.weather_unavailable
          ? WORDING.weatherNotReached
          : "No weather station reports from this field";
  const observedAt = (metar ? metar.observed_at : nearby?.metar.observed_at) ?? null;
  return { metar, weather, approximate, category, weatherLine, observedAt };
}
