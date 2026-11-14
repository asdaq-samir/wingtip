package app.wingtipmaps.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SecondaryScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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

/**
 * The airport card's section tabs, right under its four actions where they
 * are in sight at half (the owner's T4, 2026-11-14; the web's PlaceTabBar):
 * Material's scrollable tab row, pinned under the bar as the card scrolls,
 * the picked tab filled in the theme's tint with the words on it in
 * `onPrimary`, the others in the surface's words. Weather carries the dot
 * of the field's own report's flight category (AIM 7-1-7's colours, the
 * tokens'), and none where the field has no report of its own; Charts
 * carries its count. Each tab's name says the hint, "Weather, MVFR" and
 * "Charts, 9", as the dot and the count are not words.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AirportTabRow(section: Int, onPick: (Int) -> Unit, category: String?, charts: Int) {
    SecondaryScrollableTabRow(
        selectedTabIndex = section,
        containerColor = BottomSheetDefaults.ContainerColor,
        edgePadding = WingtipSpace.Lg,
        // The fill marks the picked tab; no underline beside it.
        indicator = {},
        divider = {},
    ) {
        AirportSection.entries.forEach { s ->
            val picked = section == s.ordinal
            val title = stringResource(s.title)
            val hint = when (s) {
                AirportSection.WEATHER -> category
                AirportSection.APPROACHES -> charts.takeIf { it > 0 }?.toString()
                else -> null
            }
            Tab(
                selected = picked,
                onClick = { onPick(s.ordinal) },
                selectedContentColor = MaterialTheme.colorScheme.onPrimary,
                unselectedContentColor = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier
                    .padding(vertical = WingtipSpace.Xs)
                    .clip(CircleShape)
                    .background(if (picked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHigh)
                    .semantics { contentDescription = hint?.let { "$title, $it" } ?: title },
                text = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                        if (s == AirportSection.WEATHER && category != null) {
                            // Ringed in the picked tab's words, so it reads on the tint too.
                            Box(
                                Modifier.size(WingtipSpace.Md).clip(CircleShape)
                                    .then(if (picked) Modifier.border(WingtipSpace.Xxs, MaterialTheme.colorScheme.onPrimary, CircleShape) else Modifier)
                                    .padding(if (picked) WingtipSpace.Xxs else WingtipSpace.Xxs / 2)
                                    .clip(CircleShape).background(FlightCategory.mark(category)),
                            )
                        }
                        Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (s == AirportSection.APPROACHES && charts > 0) {
                            Text(charts.toString(), style = MaterialTheme.typography.labelMedium)
                        }
                    }
                },
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
    val line = weatherLine(metar, stringResource(R.string.no_ceiling), stringResource(R.string.wind_calm)) { ceilingWords.format(it) }
    val category = metar.flightCategory
    if (category == null && line.isEmpty()) return
    Row(modifier.padding(vertical = WingtipSpace.Xs), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        category?.let { CategoryChip(it) }
        if (line.isNotEmpty()) {
            Text(line, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
