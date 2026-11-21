package app.wingtipmaps.android.plan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Planner
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
 * cards). Each asked once; a card that cannot be had leaves its field's
 * mark grey and its times in the departure's zone.
 */
@HiltViewModel
class RouteFieldFacts @Inject constructor() : ViewModel() {
    data class Facts(val zone: ZoneId?, val category: String?)

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
                    Facts(card.timeZone?.let { z -> runCatching { ZoneId.of(z) }.getOrNull() }, card.metar?.flightCategory)
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
