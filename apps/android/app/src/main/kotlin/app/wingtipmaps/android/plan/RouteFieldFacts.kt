package app.wingtipmaps.android.plan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.search.FieldMarks
import app.wingtipmaps.android.ui.AirportReads
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.ZoneId
import javax.inject.Inject

/**
 * What the plan's timeline shows of each field of the route from its
 * card (the planner's /api/airport, kept as the gateway's cache allows):
 * its time zone, for the times the timeline says there, and its flight
 * category, the colour of its mark (the web's timeline loads the same
 * cards); and, once its card says it is open, its runway ends for the
 * line's Land and Takeoff menus and the one its report's wind picks
 * (AirportReads.windEnd). Each asked once; a card that cannot be had
 * leaves its field's mark grey, its times in the departure's zone and
 * nothing offered to land by (decision 0043: never taken as open).
 */
@HiltViewModel
class RouteFieldFacts @Inject constructor() : ViewModel() {
    data class Facts(
        val zone: ZoneId?,
        val category: String?,
        /** Its card came and NASR lists it open (the planner's `closed`
         *  label empty, FieldMarks.closed): only then are runways and
         *  procedures offered on its line. */
        val open: Boolean = false,
        val ends: List<String> = emptyList(),
        val windEnd: String? = null,
        /** Its card came and NASR lists it closed (decision 0043): its
         *  pill in the route box red and said Closed. */
        val closed: Boolean = false,
    )

    private val _facts = MutableStateFlow<Map<String, Facts>>(emptyMap())
    val facts: StateFlow<Map<String, Facts>> = _facts.asStateFlow()
    private val asked = mutableSetOf<String>()

    fun load(idents: Collection<String>) {
        val wanted = idents.map(String::uppercase).filter { it.isNotEmpty() && !it.startsWith("@") && asked.add(it) }
        if (wanted.isEmpty()) return
        viewModelScope.launch {
            for (ident in wanted) {
                val facts = try {
                    val card = Planner.place(ident)
                    val open = FieldMarks.closed(card.closed) == null
                    Facts(card.timeZone?.let { z -> runCatching { ZoneId.of(z) }.getOrNull() }, card.metar?.flightCategory,
                        open = open, ends = if (open) AirportReads.runwayEnds(card) else emptyList(), windEnd = if (open) AirportReads.windEnd(card) else null, closed = !open)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Facts(null, null)
                }
                _facts.update { it + (ident to facts) }
            }
        }
    }
}
