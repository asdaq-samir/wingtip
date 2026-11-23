package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.HorizontalFloatingToolbar
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ShortNavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.Metar
import app.wingtipmaps.android.design.generated.WingtipSpace

/** How many charts the card's Charts section lists: the d-TPP's plates
 *  (the diagram among them, APD, counted once as the diagram) and the
 *  airport diagram where the field has one, as the web's Charts tab. */
fun chartCount(place: AirportPlace): Int =
    place.procedures.orEmpty().count { it.kind != "APD" } + (if (place.airportDiagramUrl != null) 1 else 0)

/** Where the FAA could not give the card its plates (the planner's
 *  `publications`, the d-TPP): "unavailable", said in place of the empty
 *  list rather than read as a field with none, or the kept earlier cycle
 *  shown in its place; null while they are of the cycle in force. The
 *  web's publicationNotes, the iPhone's AirportChartsTab.publicationNotes. */
data class PlatesNote(val keptCycle: String?)

fun platesNote(place: AirportPlace): PlatesNote? {
    val plates = place.publications?.plates ?: return null
    return when (plates.state) {
        "unavailable" -> PlatesNote(null)
        "kept" -> plates.edition?.let { PlatesNote(it) }
        else -> null
    }
}

/** The airport card's tab bar, for the UI tests. */
const val AIRPORT_TAB_BAR_TAG = "airport-tab-bar"

/**
 * The airport card's tabs in a bar floating at the card's foot, as the
 * web's PlaceTabBar and the iPhone's CardTabBar float theirs (C1, the
 * owner, 2026-11-14, after Apple Maps' place card), which took the place
 * of T4's tab row under the actions: Material 3 Expressive's floating
 * toolbar, the one FPL's actions ride (PlanFoot), holding the stock short
 * navigation bar's items, each its glyph over its word (the web's tab bar
 * since the owner's "similar size and see through", rules.md), the picked
 * one in the stock indicator. Weather carries the dot of the field's own
 * report's flight category (AIM 7-1-7's colours, the tokens'), none where
 * the field has no report of its own, and Charts its count, each
 * Material's badge on the glyph's corner; each tab's name says the hint,
 * "Weather, MVFR" and "Charts, 9", as a dot and a count are not words.
 */
@Composable
fun AirportTabBar(section: AirportSection, onPick: (AirportSection) -> Unit, category: String?, charts: Int, modifier: Modifier = Modifier) {
    HorizontalFloatingToolbar(expanded = true, modifier = modifier.padding(bottom = WingtipSpace.Xs).testTag(AIRPORT_TAB_BAR_TAG)) {
        AirportSection.entries.forEach { s ->
            val title = stringResource(s.title)
            val hint = when (s) {
                AirportSection.WEATHER -> category
                AirportSection.CHARTS -> charts.takeIf { it > 0 }?.toString()
                else -> null
            }
            ShortNavigationBarItem(
                selected = section == s,
                onClick = { onPick(s) },
                icon = {
                    BadgedBox(
                        badge = {
                            when {
                                s == AirportSection.WEATHER && category != null -> Badge(containerColor = FlightCategory.mark(category))
                                s == AirportSection.CHARTS && hint != null -> Badge { Text(hint) }
                            }
                        },
                    ) { Icon(s.icon, contentDescription = null) }
                },
                label = { Text(title, maxLines = 1) },
                modifier = Modifier.semantics { contentDescription = hint?.let { "$title, $it" } ?: title },
            )
        }
    }
}

/**
 * The field's own report in one line under the tabs (the web's
 * PlaceWeatherLine): its category as a chip (the colours as words fall
 * under 4.5:1 on the night sheet), then "Ceiling 1,800 ft · 310°T 4 kt ·
 * 1255Z". The ceiling is the planner's reading of the report (the lowest
 * broken or overcast layer or the vertical visibility, 14 CFR 1.1), "No
 * ceiling" with none, and left out where the report could not say
 * (`ceilingUnknown`); the wind true, as METAR winds are (FAA JO 7900.5),
 * calm by the engine's `wind_calm`; the time UTC, as the report gives it.
 * Nothing where the field has no report of its own.
 */
@Composable
fun AirportWeatherLine(metar: Metar?, modifier: Modifier = Modifier) {
    if (metar == null) return
    val ceilingWords = stringResource(R.string.weather_line_ceiling)
    val line = weatherLine(metar, stringResource(R.string.wording_no_ceiling), stringResource(R.string.wind_calm)) { ceilingWords.format(it) }
    val category = metar.flightCategory
    if (category == null && line.isEmpty()) return
    Row(modifier.padding(vertical = WingtipSpace.Xs), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        category?.let { CategoryChip(it) }
        if (line.isNotEmpty()) {
            Text(line, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
