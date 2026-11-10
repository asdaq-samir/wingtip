package app.wingtipmaps.android.airplane

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.plan.FlightChoices
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** The figures the pilot said "Not now" to, by key, for this launch only:
 *  each ask hidden where it was put off, the rest still shown. */
object NotNow {
    private val _hidden = MutableStateFlow<Set<String>>(emptySet())
    val hidden: StateFlow<Set<String>> = _hidden.asStateFlow()

    fun hide(key: String) {
        _hidden.value = _hidden.value + key
    }
}

/** Where the airplane's profile is open, and at which figure (null:
 *  closed): by its N-number, or by a type of the planner's with none (the
 *  one search's Airplanes). */
object ProfileOpen {
    data class At(val tail: String?, val focus: String? = null, val type: String? = null)

    private val _at = MutableStateFlow<At?>(null)
    val at: StateFlow<At?> = _at.asStateFlow()

    fun open(tail: String?, focus: String? = null, type: String? = null) {
        _at.value = At(tail?.trim()?.uppercase()?.ifEmpty { null }, focus, type?.trim()?.ifEmpty { null })
    }

    fun close() {
        _at.value = null
    }
}

/** The airplane flown now: the type picked, the N-number given, the
 *  pilot's record of it (Plan's) over the type's book. */
@Composable
fun rememberAirplaneNow(plan: Plan): AirplaneNow {
    val state by plan.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    val books by AirplaneBook.profiles.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { AirplaneBook.load() }
    return remember(state.aircraft, state.own, tail, books) {
        AirplaneNow.of(state.aircraft, tail, state.own, AirplaneBook.of(books, state.aircraft))
    }
}

/** The airplane of `tail` as its profile shows it: the one flown where it
 *  is that one (or no N-number nor type is asked), else the pilot's record
 *  of that N-number over its type's book, or the N-number alone with no
 *  figures; by `type` alone, that type's book. */
@Composable
fun rememberAirplaneOf(tail: String?, plan: Plan, type: String? = null): AirplaneNow {
    val now = rememberAirplaneNow(plan)
    val context = LocalContext.current
    val records by remember(context) { OwnAirplanes.of(context) }.records.collectAsStateWithLifecycle()
    val books by AirplaneBook.profiles.collectAsStateWithLifecycle()
    val other = remember(tail, type, records, books) {
        val record = tail?.let { records[OwnRecord.key(it, "")] }
        if (tail == null && type != null) AirplaneNow.of(type, null, null, AirplaneBook.of(books, type))
        else AirplaneNow.of("", tail, record, record?.let { AirplaneBook.of(books, it.type) })
    }
    val isNow = if (tail == null) type == null || (type.equals(now.aircraft, ignoreCase = true) && now.tail == null) else tail.equals(now.tail, ignoreCase = true)
    return if (isNow) now else other
}
