package app.wingtipmaps.android.plan

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * The minutes on the ground the pilot set at the route's stops, by the
 * time each leaves again (the web's `ground` address key): sent to the
 * planner as its `ground` ("KJVL:45"), whose flights after a stop leave
 * that much later, for their winds, their night and their times; a stop
 * not named turns round in the planner's own time. Cleared with the route.
 */
object PlanGround {
    private val _own = MutableStateFlow<Map<String, Int>>(emptyMap())
    val own: StateFlow<Map<String, Int>> = _own.asStateFlow()

    fun set(ident: String, minutes: Int) = _own.update { it + (ident.uppercase() to minutes) }

    fun clear() {
        _own.value = emptyMap()
    }

    /** The nav log's `ground` for the route's stops alone. */
    fun query(route: List<String>): Map<String, String?> {
        val on = route.map(String::uppercase).toSet()
        val words = _own.value.filterKeys { it in on }.toSortedMap().map { (ident, min) -> "$ident:$min" }.joinToString(",")
        return mapOf("ground" to words.ifEmpty { null })
    }
}
