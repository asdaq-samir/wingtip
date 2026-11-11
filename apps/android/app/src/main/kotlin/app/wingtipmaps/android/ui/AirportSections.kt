package app.wingtipmaps.android.ui

import android.content.Intent
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.net.toUri
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Charts
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ai.AiSources
import app.wingtipmaps.android.ai.AiTask
import app.wingtipmaps.android.ai.AiWordsRow
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.live.LiveAirportRows
import app.wingtipmaps.android.offline.KeptAgeLine
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.plates.APPROACH_CHART
import app.wingtipmaps.android.plates.ShowPlateButton
import app.wingtipmaps.android.receiver.ReceiverReports
import java.util.Locale

/** A field's card's sections, its tab row's tabs, in order. */
enum class AirportSection(@StringRes val title: Int) {
    OVERVIEW(R.string.section_overview),
    WEATHER(R.string.section_weather),
    RADIO(R.string.frequencies),
    RUNWAYS(R.string.section_runways),
    APPROACHES(R.string.approaches),
    NOTAMS(R.string.notams),
}

/**
 * One section of a field's card, as Material's list items with supporting
 * text: the overview -- the field's pictures in Material's carousel, its
 * aerial and its photo from the ground (the chart around the field where
 * it has none), then its elevation and the airspace over it -- the weather -- its METAR as sent under its flight category, its
 * TAF, the two in plain words, what the cockpit receiver heard where the
 * weather service has nothing, what SWIM says now -- its frequencies (each
 * copied with a tap), its runways, its approach plates (each
 * opening the FAA's PDF, and laid on the map from the row's end), and its own NOTAMs and the TFRs within 5 nm
 * as sent, the engine's ranking, each with when it is in force. Every figure the
 * planner's, written by Format.
 */
fun LazyListScope.airportSection(section: AirportSection, place: AirportPlace, state: AirportModel.State) {
    val pad = Modifier.padding(horizontal = WingtipSpace.Lg)
    when (section) {
        AirportSection.OVERVIEW -> {
            item(key = "pictures") {
                val pictures = cardPictures(place, state)
                PhotoCarousel(pictures, Modifier.padding(vertical = WingtipSpace.Sm))
            }
            place.elevationFt?.let { ft -> item(key = "elevation") { Row(stringResource(R.string.elevation), Format.altitude(ft), pad) } }
            place.airspaceClass?.let { c -> item(key = "airspace") { Row(stringResource(R.string.airspace_class, c), null, pad) } }
            place.address?.let { a -> item(key = "address") { Row(a, null, pad) } }
        }
        AirportSection.WEATHER -> item(key = "weather") {
            Column(pad) {
                KeptAgeLine(KeptForAir.AIRPORTS, state.keptAtMs)
                val metar = place.metar
                if (metar?.raw != null) {
                    Row(stringResource(R.string.metar), metar.raw, trailing = { metar.flightCategory?.let { CategoryChip(it) } })
                    place.taf?.let { Row(stringResource(R.string.taf), it) }
                    // The report and forecast in plain words, under them.
                    AiWordsRow(AiTask.AIRPORT_WEATHER, key = place.ident + metar.raw, sources = { AiSources.weather(place) })
                } else {
                    // With no report from the weather service (no signal, or
                    // none at the field), what the cockpit receiver heard.
                    ReceiverReports(place.ident) { Row(stringResource(R.string.metar), stringResource(R.string.no_weather_report)) }
                }
                LiveAirportRows(place.ident)
            }
        }
        AirportSection.RADIO -> {
            val frequencies = place.frequencies.filter { it.frequencyMhz != null }
            items(frequencies) { f ->
                Column(pad) { FrequencyRow(f.description ?: f.type.orEmpty(), Format.frequency(f.frequencyMhz ?: 0.0)) }
            }
        }
        AirportSection.RUNWAYS -> {
            items(place.runways) { r ->
                val closed = stringResource(R.string.runway_closed)
                val lighted = stringResource(R.string.runway_lighted)
                val size = listOfNotNull(r.lengthFt, r.widthFt).joinToString(" × ") { String.format(Locale.US, "%,d", it) }.ifEmpty { null }?.let { "$it ft" }
                Row(r.ends ?: "—", listOfNotNull(size, r.surface?.lowercase(), lighted.takeIf { r.lighted }, closed.takeIf { r.closed }).joinToString(" · "), pad)
            }
        }
        AirportSection.APPROACHES -> items(place.procedures.orEmpty()) { p ->
            val context = LocalContext.current
            // An approach plate laid on the map from its row's end; where it
            // cannot be placed, the row says so.
            var placed by remember(place.ident, p.name) { mutableStateOf(true) }
            val show: (@Composable () -> Unit)? = if (p.kind == APPROACH_CHART) ({ ShowPlateButton(place.ident, p.name) { placed = it } }) else null
            Row(p.name, if (placed) p.kind else stringResource(R.string.plate_not_placed), pad, trailing = show) { context.startActivity(Intent(Intent.ACTION_VIEW, p.url.toUri())) }
        }
        AirportSection.NOTAMS -> {
            state.notamsProblem?.let { item(key = "notams-problem") { ProblemLine(it, pad) } }
            // An unread TFR list is said, so no TFR shown is not read as none.
            if (state.notams?.unchecked?.contains("tfrs") == true) item(key = "notams-tfrs") { ProblemLine(stringResource(R.string.notams_tfrs_unchecked), pad) }
            val notams = state.notams?.notams?.sortedBy { it.rank }
            when {
                notams == null && state.notamsProblem == null -> item(key = "notams-loading") { LoadingRow(pad) }
                notams.isNullOrEmpty() -> item(key = "notams-none") { Row(stringResource(R.string.notams), stringResource(R.string.no_notams), pad) }
                else -> items(notams, key = { "n-" + it.id }) { n -> Row(n.raw, notamWhen(FieldAlerts.whenOf(n)), pad) }
            }
        }
    }
}

/** The field's pictures: its aerial (the USGS's, every US field's) and
 *  its photo from the ground with its credit; where the planner has
 *  neither, the chart around the field, the cycle's sectional tile. */
@Composable
private fun cardPictures(place: AirportPlace, state: AirportModel.State): List<CardPicture> {
    val aerial = stringResource(R.string.picture_aerial)
    val ground = stringResource(R.string.picture_ground)
    val chart = stringResource(R.string.picture_chart)
    val charts: Charts = viewModel()
    val info by charts.info.collectAsStateWithLifecycle()
    val photos = state.photos
    if (photos != null) {
        return listOfNotNull(CardPicture(aerial, photos.aerialUrl, "USGS National Map"), photos.photo?.let { CardPicture(ground, it.url, it.credit) })
    }
    if (!state.photosAsked) return emptyList()
    return listOfNotNull(Charts.template(info)?.let { CardPicture(chart, it.around(place.lat, place.lon, CHART_ZOOM), "FAA") })
}

/** The chart's zoom for the field's tile: a sectional's few miles about it. */
private const val CHART_ZOOM = 11

/** A row of the card: Material's list item, its supporting text under it. */
@Composable
private fun Row(headline: String, supporting: String?, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null, onClick: (() -> Unit)? = null) {
    val line: (@Composable () -> Unit)? = supporting?.takeIf { it.isNotEmpty() }?.let { { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
    val colors = ListItemDefaults.colors(containerColor = Color.Transparent)
    val title: @Composable () -> Unit = { Text(headline, style = MaterialTheme.typography.bodyLarge) }
    // Material's clickable list item where the row opens something.
    if (onClick != null) {
        ListItem(onClick = onClick, supportingContent = line, trailingContent = trailing, colors = colors, modifier = modifier.fillMaxWidth(), content = title)
    } else {
        ListItem(supportingContent = line, trailingContent = trailing, colors = colors, modifier = modifier.fillMaxWidth(), content = title)
    }
}

/** "In effect now, until Nov 12 1432Z", "From Nov 12 1400Z", or none. */
@Composable
fun notamWhen(w: FieldAlerts.When?): String? = when (w) {
    is FieldAlerts.When.Now -> w.ends?.let { stringResource(R.string.notam_now_until, it) } ?: stringResource(R.string.notam_now)
    is FieldAlerts.When.Coming -> w.ends?.let { stringResource(R.string.notam_from_until, w.starts, it) } ?: stringResource(R.string.notam_from, w.starts)
    null -> null
}
