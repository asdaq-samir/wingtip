package app.wingtipmaps.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.card.CardTab

/** How many charts the card's Charts page lists: the d-TPP's plates
 *  (the diagram among them, APD, counted once as the diagram) and the
 *  airport diagram where the field has one, as the web's Charts tab. */
fun chartCount(place: AirportPlace): Int =
    place.procedures.orEmpty().count { it.kind != "APD" } + (if (place.airportDiagramUrl != null) 1 else 0)

/**
 * The airport card's pages in its floating bar (C1, the owner,
 * 2026-11-14; the web's PlaceTabBar): Info, Weather, Runways and Charts.
 * Weather leads with the dot of the field's own report's flight category
 * (AIM 7-1-7's colours, the tokens'), none where the field has no report
 * of its own; Charts carries its count. Each says its hint to TalkBack,
 * "Weather, MVFR" and "Charts, 9", as the dot and the count are not words.
 */
@Composable
fun airportTabs(category: String?, charts: Int): List<CardTab> = AirportSection.entries.map { s ->
    val title = stringResource(s.title)
    when (s) {
        AirportSection.WEATHER -> CardTab(title, hint = category, lead = category?.let { c -> { CategoryDot(c) } })
        AirportSection.CHARTS -> CardTab(title, hint = charts.takeIf { it > 0 }?.toString(), count = charts.takeIf { it > 0 })
        else -> CardTab(title)
    }
}

/** A flight category's dot, the map's pip colour. */
@Composable
private fun CategoryDot(category: String) {
    Box(Modifier.size(WingtipSpace.Sm).clip(CircleShape).background(FlightCategory.mark(category)))
}
