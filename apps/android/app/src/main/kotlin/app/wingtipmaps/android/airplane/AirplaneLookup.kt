package app.wingtipmaps.android.airplane

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.airplaneDetails
import app.wingtipmaps.android.api.airplanePhoto
import app.wingtipmaps.android.api.findAirplane
import app.wingtipmaps.android.api.generated.AircraftRegistration
import app.wingtipmaps.android.api.generated.AirplaneDetails
import app.wingtipmaps.android.api.generated.AirplanePhoto
import app.wingtipmaps.android.api.generated.PastFlightSummary
import app.wingtipmaps.android.api.generated.TrafficFound
import app.wingtipmaps.android.api.pastFlights
import app.wingtipmaps.android.api.registered
import app.wingtipmaps.android.format.Format
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.math.roundToInt

/** Whether an airplane is in the air, from the live find
 *  (/api/traffic/find), which waits on the live sources: checking until it
 *  answers, never guessed. */
sealed interface InAir {
    data object Checking : InAir
    data class Flying(val hex: String, val altitudeFt: Double?, val speedKt: Double?) : InAir
    data object Ground : InAir
    /** The live sources could not say (adsb.lol busy, `checked` false). */
    data object Unknown : InAir
    data class Failed(val why: String) : InAir

    companion object {
        /** The find's answer as whether it is in the air. */
        fun of(found: TrafficFound): InAir {
            val plane = found.aircraft.firstOrNull()
            return when {
                plane != null -> Flying(plane.hex, plane.altitudeFt, plane.speedKt)
                found.checked == false -> Unknown
                else -> Ground
            }
        }
    }
}

/** What a page says of an airplane's air, and whether it is a problem
 *  (said in the error style): the web's inAirWords. A target's altitude
 *  to the hundred feet, as ATC gives it (Format.reportedAltitude). */
fun inAirWords(inAir: InAir): Pair<String, Boolean> = when (inAir) {
    InAir.Checking -> "Checking whether it's in the air…" to false
    is InAir.Flying -> (listOf("In the air") + listOfNotNull(inAir.altitudeFt?.let(Format::reportedAltitude), inAir.speedKt?.let { "${it.roundToInt()} kt" })).joinToString(" · ") to false
    InAir.Ground -> "Not in the air now" to false
    InAir.Unknown -> "Whether it's in the air isn't known now. Try again in a moment." to true
    is InAir.Failed -> inAir.why to true
}

/**
 * The airplane card's one status line, under its tabs (the owner's P1,
 * 2026-11-14; the web's statusLine): in the air from the live find; else
 * where its last flight ended, from its past flights; else that none was
 * heard in adsb.lol's archive, about six weeks (wingtip.traffic
 * ARCHIVE_DAYS). `flights` newest first, null while still looked for.
 */
fun statusLine(inAir: InAir, flights: List<PastFlightSummary>?, nowMs: Long = AppClock.nowMs()): Pair<String, Boolean> {
    if (inAir != InAir.Ground) return inAirWords(inAir)
    val latest = flights?.firstOrNull { !it.inAir }
    if (latest != null) {
        val since = ago(nowMs - (latest.on * 1000).toLong())
        val at = latest.destination?.ident
        return (if (latest.landed && at != null) "On the ground · landed $at $since" else "Not in the air · last heard $since") to false
    }
    if (flights != null && flights.isEmpty()) return "Not heard in the last 6 weeks" to false
    return inAirWords(inAir)
}

/** "5 min ago", "3 h ago", "2 days ago": how long since, in the largest unit. */
fun ago(ms: Long): String {
    val min = (ms / 60_000).coerceAtLeast(0)
    return when {
        min < 60 -> "$min min ago"
        min < 48 * 60 -> "${min / 60} h ago"
        else -> "${min / (24 * 60)} days ago"
    }
}

/**
 * An airplane's card's view model (the owner's P1, 2026-11-14): its FAA
 * record asked by itself and drawn at once, whether it is in the air asked
 * of the live find beside it ("Checking whether it's in the air…" until
 * it answers), the rest of its public record, its photo (shown only when
 * that call answers) and its past flights by its ICAO address, each
 * failing on its own and said where it shows.
 */
@HiltViewModel
class AirplaneLookup @Inject constructor() : ViewModel() {
    data class State(
        val tail: String? = null,
        val record: AircraftRegistration? = null,
        val recordAsked: Boolean = false,
        val inAir: InAir = InAir.Checking,
        val details: AirplaneDetails? = null,
        val detailsProblem: String? = null,
        val photo: AirplanePhoto? = null,
        /** Its flights newest first; null while asked. */
        val flights: List<PastFlightSummary>? = null,
        val flightsProblem: String? = null,
        /** Its ICAO address, the registry's or the find's, for its flights. */
        val hex: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private val jobs = mutableListOf<Job>()

    /** Everything asked for `tail` at once, each answer drawn as it comes. */
    fun open(tail: String) {
        if (_state.value.tail == tail) return
        jobs.forEach { it.cancel() }
        jobs.clear()
        _state.value = State(tail = tail)
        jobs += viewModelScope.launch {
            val record = quietly { Planner.registered(tail) }
            _state.update { it.copy(record = record, recordAsked = true) }
            record?.modeSHex?.let(::flightsOf)
        }
        jobs += viewModelScope.launch {
            val inAir = try {
                InAir.of(Planner.findAirplane(tail))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                InAir.Failed(Problems.say("Couldn't check whether it's in the air", e))
            }
            _state.update { it.copy(inAir = inAir) }
            (inAir as? InAir.Flying)?.hex?.let(::flightsOf)
        }
        jobs += viewModelScope.launch {
            try {
                val details = Planner.airplaneDetails(tail)
                _state.update { it.copy(details = details, detailsProblem = null) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(detailsProblem = Problems.say("Its history couldn't be fetched", e)) }
            }
        }
        jobs += viewModelScope.launch {
            val photo = Planner.airplanePhoto(tail)
            _state.update { it.copy(photo = photo) }
        }
    }

    /** Its past flights, once its address is known (the registry's first). */
    private fun flightsOf(hex: String) {
        if (_state.value.hex != null) return
        _state.update { it.copy(hex = hex.lowercase()) }
        jobs += viewModelScope.launch {
            try {
                val flights = Planner.pastFlights(hex).flights
                _state.update { it.copy(flights = flights, flightsProblem = null) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(flightsProblem = Problems.say("Its flights couldn't be fetched", e)) }
            }
        }
    }

    private suspend fun <T> quietly(call: suspend () -> T): T? = try {
        call()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }
}
