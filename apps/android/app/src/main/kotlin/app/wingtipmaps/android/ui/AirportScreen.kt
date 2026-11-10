package app.wingtipmaps.android.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ai.AiSources
import app.wingtipmaps.android.ai.AiTask
import app.wingtipmaps.android.ai.AiWordsRow
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.AirportSuggestion
import app.wingtipmaps.android.design.RefreshBox
import app.wingtipmaps.android.design.Skeleton
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.live.LiveAirportRows
import app.wingtipmaps.android.offline.KeptAgeLine
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.receiver.ReceiverReports

/**
 * The Airport tab: a field found by ident or name, and its card -- the
 * airport card's actions first (Fly Here, Add Stop, Call, Address, the
 * web's set), then its name, where it is, its elevation and its METAR
 * as sent with its flight category. The planner's words throughout; the
 * raw report stays as the station sent it.
 *
 * @param ident a field to open as the tab is shown (a link's `place`, a
 *   tap on the map), or empty.
 * @param onDone after an action that changes the route, so a sheet over
 *   the strip can close and show it.
 */
@Composable
fun AirportScreen(ident: String, plan: Plan, onDone: () -> Unit = {}, model: AirportModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val actions = rememberRouteActions(plan)
    LaunchedEffect(ident) { if (ident.isNotEmpty()) model.open(ident) }

    Column(Modifier.fillMaxSize().padding(horizontal = WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        OutlinedTextField(
            value = state.query, onValueChange = model::search, modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.tab_airport)) }, singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Search),
        )
        ProblemLine(state.problem)
        // A pull on the open card fetches it again: the weather is live.
        RefreshBox(refreshing = state.loading && state.place != null, onRefresh = model::refresh, enabled = state.place != null, modifier = Modifier.weight(1f)) {
            LazyColumn(Modifier.fillMaxSize()) {
                if (state.loading && state.suggestions.isEmpty() && state.place == null) item(key = "loading") { Skeleton(Modifier.padding(vertical = WingtipSpace.Md)) }
                items(state.suggestions) { found ->
                    SuggestionRow(found) { model.open(found.ident) }
                    HorizontalDivider()
                }
                state.place?.let { place ->
                    item {
                        CardActionRow(
                            CardKind.AIRPORT,
                            can = { actions.canAirport(it, place) },
                            onAction = { action ->
                                actions.airport(action, place)
                                if (action == CardAction.FLY_HERE || action == CardAction.ADD_STOP) onDone()
                            },
                        )
                        PlaceCard(place, keptAtMs = state.keptAtMs)
                    }
                }
            }
        }
    }
}

/** A field the search found: its ident and name, where it is under them. */
@Composable
internal fun SuggestionRow(found: AirportSuggestion, onOpen: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = stringResource(R.string.said_open), onClick = onOpen).padding(vertical = WingtipSpace.Md)) {
        Text("${found.ident}  ${found.name}", style = MaterialTheme.typography.bodyLarge)
        val where = listOfNotNull(found.municipality, found.region).joinToString(", ")
        if (where.isNotEmpty()) {
            Text(where, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** The field's card: its name, where it is, its elevation, its diagram
 *  with the airplane on it, and its METAR as sent under its flight
 *  category's chip; how old it is where it is the card kept for the air
 *  (`keptAtMs`, KeptAgeLine). */
@Composable
fun PlaceCard(place: AirportPlace, keptAtMs: Long? = null) {
    Column(Modifier.fillMaxWidth().padding(vertical = WingtipSpace.Md), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        Text(place.name, style = MaterialTheme.typography.headlineSmall)
        val where = listOfNotNull(place.ident, place.municipality, place.region).joinToString(" · ")
        Text(where, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        KeptAgeLine(KeptForAir.AIRPORTS, keptAtMs)
        place.elevationFt?.let { Text(stringResource(R.string.elevation_is, Format.altitude(it)), style = MaterialTheme.typography.bodyMedium) }
        // The FAA's diagram with the airplane on it, by the diagram's own
        // latitude and longitude marks (#218).
        place.airportDiagramUrl?.let { url ->
            var open by remember { mutableStateOf(false) }
            OutlinedButton(onClick = { open = true }) { Text(stringResource(R.string.diagram_with_position)) }
            if (open) DiagramOwnShipDialog(place.ident, url) { open = false }
        }
        val metar = place.metar
        if (metar?.raw != null) {
            Row(Modifier.padding(top = WingtipSpace.Sm), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                SectionTitle(stringResource(R.string.metar), Modifier.padding(bottom = WingtipSpace.Md))
                metar.flightCategory?.let { CategoryChip(it) }
            }
            Text(metar.raw, style = MaterialTheme.typography.bodyMedium)
            // The report and forecast in plain words, under them.
            AiWordsRow(AiTask.AIRPORT_WEATHER, key = place.ident + metar.raw, sources = { AiSources.weather(place) })
        } else {
            // With no report from the weather service (no signal, or none
            // at the field), what the cockpit receiver heard over FIS-B.
            ReceiverReports(place.ident) {
                Text(stringResource(R.string.no_weather_report), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        // What SWIM says now: the D-ATIS, the RVR, a ground stop or delay.
        LiveAirportRows(place.ident)
        // The field's frequencies as NASR lists them, each copied with a tap.
        val frequencies = place.frequencies.filter { it.frequencyMhz != null }
        if (frequencies.isNotEmpty()) {
            SectionTitle(stringResource(R.string.frequencies))
            frequencies.forEach { f -> FrequencyRow(f.description ?: f.type.orEmpty(), Format.frequency(f.frequencyMhz!!)) }
        }
    }
}
