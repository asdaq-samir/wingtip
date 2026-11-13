package app.wingtipmaps.android.widget

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.format.Format
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The next flight as the home screen's widget shows it (NextFlightWidget),
 * the twin of the iPhone's WidgetSnapshot: the route as the plan names it
 * and the nav log's totals, kept by the app in its own preferences each
 * time the plan settles, so the widget never asks the planner and shows
 * the app's own answer with when it last changed. The time and the fuel
 * are left out with no airplane picked, as everywhere (decision 0011).
 */
@Serializable
data class FlightSnapshot(
    val dep: String,
    val dest: String,
    val stops: List<String> = emptyList(),
    val distanceNm: Double? = null,
    val eteMin: Double? = null,
    val fuelGal: Double? = null,
    /** When the flight leaves, where the plan has a time. */
    val departMs: Long? = null,
    val updatedAtMs: Long,
) {
    /** "C81 → KDLH", with "· 1 stop" where there are stops. */
    val route: String get() = "$dep → $dest" + when (stops.size) {
        0 -> ""
        1 -> " · 1 stop"
        else -> " · ${stops.size} stops"
    }

    /** "102.4 nm · 1h 5m · 18.4 gal", the figures the plan has. */
    val figures: String get() = listOfNotNull(
        distanceNm?.let(Format::distance),
        eteMin?.let(Format::duration),
        fuelGal?.let(Format::fuel),
    ).joinToString(" · ").ifEmpty { Format.NONE }

    /** "Leaves 14:30", where the plan has a time. */
    val leaves: String? get() = departMs?.let { "Leaves ${Format.clock(it)}" }

    /** "As of 13:02". */
    val asOf: String get() = "As of ${Format.clock(updatedAtMs)}"

    companion object {
        private const val PREFS = "widget"
        private val KEY = stringPreferencesKey("nextFlight")
        private val json = Json { ignoreUnknownKeys = true }

        /** The snapshot of a plan, or null with no route to show. */
        fun of(plan: Plan.State, nowMs: Long): FlightSnapshot? {
            if (!plan.routed) return null
            val totals = plan.totals
            return FlightSnapshot(
                dep = plan.dep,
                dest = plan.dest,
                stops = plan.stops,
                distanceNm = totals?.distanceNm ?: plan.course?.distanceNm,
                eteMin = totals?.eteMin?.takeIf { plan.airplane },
                fuelGal = totals?.fuelRequiredGal?.takeIf { plan.airplane },
                departMs = Plan.departMs(plan.depart),
                updatedAtMs = nowMs,
            )
        }

        /** The snapshot kept, or null with none (or one that no longer reads). */
        fun read(context: Context): FlightSnapshot? =
            Kept.of(context, PREFS)[KEY]
                ?.let { runCatching { json.decodeFromString<FlightSnapshot>(it) }.getOrNull() }

        /** Keeps `snapshot`, or forgets the one kept with null; true where
         *  what is kept changed, ignoring when. */
        fun write(context: Context, snapshot: FlightSnapshot?): Boolean {
            val kept = read(context)
            if (kept?.copy(updatedAtMs = 0) == snapshot?.copy(updatedAtMs = 0)) return false
            Kept.of(context, PREFS).edit {
                if (snapshot == null) it.remove(KEY) else it.set(KEY, json.encodeToString(FlightSnapshot.serializer(), snapshot))
            }
            return true
        }
    }
}
