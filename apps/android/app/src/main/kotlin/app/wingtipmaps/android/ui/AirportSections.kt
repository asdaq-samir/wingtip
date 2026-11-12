package app.wingtipmaps.android.ui

import android.content.Intent
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.net.toUri
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Charts
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ai.AiSources
import app.wingtipmaps.android.ai.AiTask
import app.wingtipmaps.android.ai.AiWordsRow
import app.wingtipmaps.android.api.AirportPlace
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
 * What the card's sections show beside the place itself: the badges on
 * what the field's NOTAMs address (NotamMarks), the runways' Best Wind and
 * Longest (RunwayBadges), the NOTAMs tab's list (CardNotams), how a badge
 * opens its NOTAMs, and the airport diagram where the field has one.
 */
class AirportCardView(
    val marks: NotamMarks,
    val runways: RunwayBadges,
    val notams: CardNotams,
    val onNotam: (NotamMark) -> Unit,
    val onDiagram: (() -> Unit)?,
)

/**
 * One section of a field's card, as Material's list items with supporting
 * text: the overview -- the field's pictures in Material's carousel, its
 * aerial and its photo from the ground (the chart around the field where
 * it has none), then its elevation, the airspace over it, its address (a
 * tap shows it in the maps app) and its fuel -- the weather -- its METAR
 * as sent under its flight category, its TAF, the two in plain words, what
 * the cockpit receiver heard where the weather service has nothing, what
 * SWIM says now -- its frequencies (each copied with a tap), its runways
 * and lights, its airport diagram and approach plates (each opening the
 * FAA's PDF, and laid on the map from the row's end), and its own NOTAMs
 * and the TFRs within 5 nm, each read by the engine (NotamRows). A thing a
 * NOTAM in force addresses has its badge by its name. Every figure the
 * planner's or the engine's, written by Format.
 */
fun LazyListScope.airportSection(section: AirportSection, place: AirportPlace, state: AirportModel.State, view: AirportCardView) {
    val pad = Modifier.padding(horizontal = WingtipSpace.Lg)
    when (section) {
        AirportSection.OVERVIEW -> {
            item(key = "pictures") {
                val pictures = cardPictures(place, state)
                PhotoCarousel(pictures, Modifier.padding(vertical = WingtipSpace.Sm))
            }
            place.elevationFt?.let { ft -> item(key = "elevation") { Row(stringResource(R.string.elevation), Format.altitude(ft), pad) } }
            place.airspaceClass?.let { c -> item(key = "airspace") { Row(stringResource(R.string.airspace_class, c), null, pad) } }
            // The address in the phone's maps app, where the card's Address
            // action was (the owner, 2026-11-11: "replace address button
            // with favorite"; the web's Info tab row).
            place.address?.let { a ->
                item(key = "address") {
                    val context = LocalContext.current
                    Row(a, null, pad) { CardIntents.address(context, place.lat, place.lon, a) }
                }
            }
            fuelRows(state.services, view.marks.fuel, view.onNotam, pad)
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
            itemsIndexed(place.frequencies) { i, f ->
                val mhz = f.frequencyMhz ?: return@itemsIndexed
                val mark = view.marks.frequency[i]
                Column(pad) {
                    FrequencyRow(f.description ?: f.type.orEmpty(), Format.frequency(mhz), badge = mark?.let { { NotamBadgeButton(it, view.onNotam) } })
                }
            }
        }
        AirportSection.RUNWAYS -> {
            runwayRows(place, view.marks, view.runways, view.onNotam, pad)
            lightRows(place, view.marks, view.onNotam, pad)
        }
        AirportSection.APPROACHES -> {
            // The airport diagram first, as the web's Charts tab has it, with
            // own ship on it (DiagramOwnShipDialog).
            view.onDiagram?.let { open -> item(key = "diagram") { Row(stringResource(R.string.diagram), null, pad, onClick = open) } }
            items(place.procedures.orEmpty()) { p ->
                val context = LocalContext.current
                // An approach plate laid on the map from its row's end; where it
                // cannot be placed, the row says so.
                var placed by remember(place.ident, p.name) { mutableStateOf(true) }
                val show: (@Composable () -> Unit)? = if (p.kind == APPROACH_CHART) ({ ShowPlateButton(place.ident, p.name) { placed = it } }) else null
                val mark = view.marks.approach[p.url]
                PlaceRow(
                    headline = { Titled(p.name) { mark?.let { NotamBadgeButton(it, view.onNotam) } } },
                    supporting = if (placed) p.kind else stringResource(R.string.plate_not_placed),
                    modifier = pad,
                    trailing = show,
                ) { context.startActivity(Intent(Intent.ACTION_VIEW, p.url.toUri())) }
            }
        }
        AirportSection.NOTAMS -> notamsSection(view.notams, pad)
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
    val charts: Charts = hiltViewModel()
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
private fun Row(headline: String, supporting: String?, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null, onClick: (() -> Unit)? = null) =
    PlaceRow(headline = { Text(headline, style = MaterialTheme.typography.bodyLarge) }, modifier = modifier, supporting = supporting, trailing = trailing, onClick = onClick)
