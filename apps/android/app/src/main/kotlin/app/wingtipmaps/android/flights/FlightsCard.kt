package app.wingtipmaps.android.flights

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.gateway.FlightSummaryDto
import app.wingtipmaps.android.api.readOrNone
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject

/** The pilot's saved flights from the gateway (GET /api/flights); a fake
 *  in the tests. */
fun interface SavedFlights {
    suspend fun list(): List<FlightSummaryDto>
}

/**
 * Saved Flights' view model (the Android audit's AND-6, the owner's (b):
 * Flights now, Sunlight later): the pilot's saved flights, newest first as
 * the gateway gives them, fetched as the card opens, a failure said where
 * the list would be.
 */
@HiltViewModel
class FlightsModel(private val source: SavedFlights) : ViewModel() {
    @Inject
    constructor() : this(SavedFlights { Gateway.api.flightList().readOrNone().orEmpty() })

    data class State(val flights: List<FlightSummaryDto> = emptyList(), val loading: Boolean = false, val problem: String? = null)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(loading = true, problem = null) }
        viewModelScope.launch {
            try {
                val flights = source.list()
                _state.update { State(flights = flights) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, problem = Problems.say("Your saved flights could not be fetched", e)) }
            }
        }
    }

    companion object {
        private val SAVED_ON = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.US)

        /** "14 Nov 2026", in the phone's zone, which the screen says as
         *  "Saved 14 Nov 2026" (R.string.saved_on): saved, not filed, as the
         *  app can really file with Flight Service (the code audit's
         *  CODE-14, the web's and the iPhone's words). */
        fun savedOn(createdAt: String, zone: ZoneId = ZoneId.systemDefault()): String? =
            runCatching { SAVED_ON.format(Instant.parse(createdAt).atZone(zone)) }.getOrNull()

        /** The flight's route: its ends and its stops between. */
        fun route(f: FlightSummaryDto): String = (listOf(f.departureIdent) + f.stops + f.destinationIdent).joinToString(" → ")
    }
}

/**
 * Saved Flights, a card on the sheet's stack opened from You's Flights row
 * (rules.md §8.1, as the web's FlightsPanel and the iPhone's Flights): each
 * flight its name (else its route), its route, when it was saved and how
 * far; a tap plans it as the pilot's route at its own altitude, and the
 * plan shows.
 */
@Composable
fun FlightsCard(plan: Plan, exit: CardExit, onUsed: () -> Unit, model: FlightsModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { model.load() }
    CardPage(title = stringResource(R.string.saved_flights), exit = exit) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(bottom = WingtipSpace.Xl), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
            state.problem?.let { item(key = "problem") { ProblemLine(it, Modifier.padding(horizontal = WingtipSpace.Lg), onRetry = model::load) } }
            if (state.loading) item(key = "loading") { LoadingRow(Modifier.padding(WingtipSpace.Lg)) }
            if (!state.loading && state.problem == null && state.flights.isEmpty()) {
                item(key = "none") {
                    Text(stringResource(R.string.saved_flights_none), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(WingtipSpace.Lg))
                }
            }
            items(state.flights, key = { it.id }) { f ->
                val route = FlightsModel.route(f)
                ListItem(
                    onClick = {
                        plan.useLeg(f.departureIdent, f.destinationIdent, f.stops, f.cruiseAltitudeFt?.toDouble(), null)
                        onUsed()
                    },
                    supportingContent = {
                        Text(listOfNotNull(route.takeIf { f.name != null }, FlightsModel.savedOn(f.createdAt)?.let { stringResource(R.string.saved_on, it) }, f.totalDistanceNm?.let(Format::distance)).joinToString(" · "))
                    },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    content = { Text(f.name ?: route, style = MaterialTheme.typography.titleMedium) },
                )
            }
        }
    }
}
