package app.wingtipmaps.android.briefing

import app.wingtipmaps.android.checklist.TextStore
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.passengerBriefing
import app.wingtipmaps.android.strip.StripData
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import app.wingtipmaps.android.format.Format

/** An item of the briefing: its key, its title and where it comes from
 *  (`rule`), the engine's. */
typealias PassengerItem = EngineContract.PassengerBriefingAnswerItem

/**
 * The passengers' briefing, ticked off for the flight before engine
 * start (#223), and the flight in a few lines to send them. Pure, so the
 * words are held on the JVM (PassengerBriefingTest).
 *
 * The items follow SAFETY, the FAASTeam's passenger briefing: Seat belts,
 * Air, Fire, Exits, Traffic and talking, Your questions (FAA Safety
 * Briefing, "Passenger SAFETY briefing", Jan/Feb 2007 and Jul/Aug 2014).
 * Of them only the first is a regulation's: 14 CFR 91.107(a)(1) has the
 * pilot in command make sure each person on board is briefed on how to
 * fasten and unfasten their seat belt and shoulder harness, and
 * 91.107(a)(2) and (3) that they are fastened for taxi, takeoff and
 * landing. The Private Pilot ACS (FAA-S-ACS-6C), task PA.II.B, skill S2,
 * asks for a passenger briefing that covers the belts and harnesses,
 * the doors, the passengers' conduct, a sterile cockpit, keeping clear
 * of the propeller and the emergency procedures, which the exits item
 * carries.
 */
object PassengerBriefing {
    /** The items and their sources, the engine's (`passenger_briefing`),
     *  as the web and the iPhone list them; asked once, and a failure the
     *  model's to show (PassengerModel.State.problem). */
    val ITEMS: Result<List<PassengerItem>> by lazy { Engine.passengerBriefing() }

    private val CLOCK = DateTimeFormatter.ofPattern("HH:mm", Locale.US)
    private val ZULU = DateTimeFormatter.ofPattern("HHmm'Z'", Locale.US).withZone(ZoneOffset.UTC)

    /**
     * The flight in a few lines for the passengers, the web app's
     * passengerMessage (lib/passengers): where to, when it leaves and
     * lands (the phone's clock, and UTC as reports give it, "1910Z"),
     * about how long in the air, and the destination's weather now where
     * it reports. The landing is from the exact minutes, as the nav log's
     * arrival is.
     */
    fun message(
        dep: String,
        dest: String,
        destName: String?,
        departMs: Long?,
        eteMin: Double?,
        weather: String?,
        zone: ZoneId = ZoneId.systemDefault(),
    ): String {
        val flying = eteMin?.let(Format::duration)
        val lands = if (departMs != null && eteMin != null) departMs + (eteMin * 60_000).toLong() else null
        fun clock(ms: Long) = CLOCK.format(Instant.ofEpochMilli(ms).atZone(zone))
        val leaving = when {
            departMs != null -> buildString {
                append("Leaving ${clock(departMs)} (${ZULU.format(Instant.ofEpochMilli(departMs))})")
                if (flying != null) append(", about $flying in the air")
                if (lands != null) append(", landing about ${clock(lands)}")
                append(".")
            }
            flying != null -> "About $flying in the air."
            else -> null
        }
        return listOfNotNull(
            "$dep to ${if (destName.isNullOrBlank()) dest else "$destName ($dest)"}",
            leaving,
            weather?.takeIf { it.isNotBlank() }?.let { "Weather at $dest now: $it." },
        ).joinToString("\n")
    }

    /** The destination's report in words, as the web's briefing puts it:
     *  the flight category, then the ceiling and the visibility
     *  ("VFR, no ceiling · 10 sm"); null with no report. */
    fun weatherWords(category: String?, ceilingFt: Double?, visibilitySm: Double?): String? {
        if (category == null && ceilingFt == null && visibilitySm == null) return null
        val ceiling = ceilingFt?.let(Format::altitude) ?: "no ceiling"
        val visibility = visibilitySm?.let { "${String.format(Locale.US, "%.2f", it).trimEnd('0').trimEnd('.')} sm" } ?: "—"
        return listOfNotNull(category, "$ceiling · $visibility").joinToString(", ")
    }
}

/**
 * The items ticked, for one flight: kept on the phone under the flight's
 * name, and cleared by the next flight's, since a briefing is given
 * before each.
 */
class PassengerTicks(private val store: TextStore) {
    fun ticked(flight: String): Set<String> =
        if (store.read(FLIGHT) != flight) emptySet() else store.read(TICKED).orEmpty().split(',').filter { it.isNotEmpty() }.toSet()

    fun save(flight: String, ticked: Set<String>) {
        store.write(FLIGHT, flight)
        store.write(TICKED, ticked.sorted().joinToString(","))
    }

    private companion object {
        const val FLIGHT = "pax.flight"
        const val TICKED = "pax.ticked"
    }
}
