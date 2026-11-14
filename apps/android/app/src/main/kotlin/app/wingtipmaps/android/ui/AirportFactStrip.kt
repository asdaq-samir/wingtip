package app.wingtipmaps.android.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.card.CardFact
import app.wingtipmaps.android.ui.card.CardFacts

/**
 * The airport card's facts in a sideways strip under its actions (C1, the
 * owner, 2026-11-14; the web's PlaceFacts), each where the card has it, in
 * this order:
 *  - Weather: the flight category (AIM 7-1-7) as its badge, its own or,
 *    marked "≈", the model's for the field or a near station's.
 *  - Wind: the report's, true, as METAR winds are (FAA JO 7900.5).
 *  - Longest: the longest runway open, those NASR or a NOTAM closes left
 *    out; "Runway" over the one there is.
 *  - Elevation: NASR's field elevation, feet MSL.
 *  - Distance: from own ship, else "From KMSN", the route's departure.
 *  - Fuel: NASR's fuel for sale by its names (the engine's fuel_names).
 */
@Composable
fun AirportFactStrip(f: AirportFacts, fuel: String?) {
    val category = f.category ?: f.approximate?.category
    val approximate = f.approximate.takeIf { f.category == null }
    val aboutWords = approximate?.let { a ->
        a.station?.let { stringResource(R.string.place_category_near, it) } ?: stringResource(R.string.place_category_modelled)
    }
    val wind = when {
        f.calm -> stringResource(R.string.wind_calm)
        f.windKt == null -> null
        else -> listOfNotNull(f.windFromDeg?.let(Format::heading) ?: "VRB", Format.speed(f.windKt), f.gustKt?.let { "G" + Format.speed(it) }).joinToString(" ")
    }
    val facts = listOfNotNull(
        category?.let { c ->
            val said = aboutWords?.let { stringResource(R.string.place_category_about, c, it) } ?: c
            CardFact(stringResource(R.string.fact_weather), said) { CategoryChip(c, approximate = approximate != null) }
        },
        wind?.let { CardFact(stringResource(R.string.fact_wind), it) },
        f.longestRunwayFt?.let { CardFact(stringResource(if (f.openRunways > 1) R.string.place_fact_longest else R.string.place_fact_runway), Format.altitude(it.toDouble())) },
        f.elevationFt?.let { CardFact(stringResource(R.string.fact_elevation), Format.altitude(it)) },
        // Whole miles, as the web's card says a field's distance.
        f.distanceNm?.let { CardFact(f.fromIdent?.let { from -> stringResource(R.string.fact_from, from) } ?: stringResource(R.string.fact_distance), Format.wholeMiles(it)) },
        fuel?.let { CardFact(stringResource(R.string.fuel), it) },
    )
    CardFacts(facts, tag = "place-facts")
}
