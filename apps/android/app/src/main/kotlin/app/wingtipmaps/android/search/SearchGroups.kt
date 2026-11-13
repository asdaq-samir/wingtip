package app.wingtipmaps.android.search

import app.wingtipmaps.android.airplane.OwnRecord
import app.wingtipmaps.android.api.AirportSuggestion
import app.wingtipmaps.android.api.generated.AircraftProfileSummary
import app.wingtipmaps.android.api.generated.AircraftRegistration
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.strip.FieldCommand
import app.wingtipmaps.android.strip.FieldCommands
import app.wingtipmaps.android.ui.OpenScreen

/** An airplane the one search found: the pilot's own, one in the FAA's
 *  registry by its N-number, or one of the planner's airplane types. */
sealed interface AirplaneHit {
    data class Own(val record: OwnRecord) : AirplaneHit

    data class Registered(val registration: AircraftRegistration) : AirplaneHit

    data class Type(val profile: AircraftProfileSummary) : AirplaneHit
}

/** What the search's Do group offers: Direct To a field or fix, one of the
 *  app's screens by its name, or the line asked of the assistant. */
sealed interface DoAction {
    data class DirectTo(val ident: String) : DoAction

    data class Open(val screen: Screen) : DoAction

    data class Ask(val question: String) : DoAction
}

/** What a tap in the search picked, done by the root (SearchPicks). */
sealed interface SearchPick {
    data class Airport(val ident: String, val name: String) : SearchPick

    data class Waypoint(val ident: String) : SearchPick

    /** An airplane's profile: by its N-number, or a type with none. */
    data class Airplane(val tail: String?, val type: String?, val name: String) : SearchPick

    data class Do(val action: DoAction) : SearchPick

    /** The flight's card: the plan. */
    data object Flight : SearchPick
}

/**
 * How the one search sorts what it found into its groups -- Airports,
 * Waypoints and Navaids, Airplanes, Do -- as the web's and the iPhone's
 * searches sort them. Pure, for a unit test; the finding is SearchModel's
 * (the planner's airport search, the FAA registry, the pilot's records).
 */
object SearchGroups {
    /** The most of each group shown: what a phone shows without a scroll
     *  hiding the next group. */
    const val MAX_GROUP = 5

    /** The planner's answer split in two: the fields, then the named fixes
     *  and navaids it marks `kind` "fix" (/api/airports/search?fixes). */
    fun split(found: List<AirportSuggestion>): Pair<List<AirportSuggestion>, List<AirportSuggestion>> {
        val (fixes, fields) = found.partition { it.kind == "fix" }
        return fields.take(MAX_GROUP) to fixes.take(MAX_GROUP)
    }

    /**
     * Whether a line is a US N-number, worth asking the FAA's registry for:
     * "N" then a digit other than zero and up to four more digits or
     * letters (14 CFR 47.15(b)); spaces and a dash typed in it are dropped.
     */
    fun looksLikeTail(query: String): Boolean = TAIL.matches(compact(query))

    fun compact(query: String): String = query.trim().uppercase().filterNot { it == ' ' || it == '-' }

    /** The pilot's own airplanes by N-number or type, then the planner's
     *  types by name or designator, a few of each. */
    fun airplanes(query: String, own: Collection<OwnRecord>, types: List<AircraftProfileSummary>): List<AirplaneHit> {
        val q = compact(query)
        if (q.isEmpty()) return emptyList()
        val mine = own.filter { r ->
            r.tail?.uppercase()?.startsWith(q) == true || (r.type.isNotEmpty() && r.type.uppercase().startsWith(q))
        }.take(MAX_GROUP).map(AirplaneHit::Own)
        val stock = types.filter { t ->
            t.name.uppercase().startsWith(q) || t.type.uppercase().split(' ').any { it.startsWith(q) }
        }.take(MAX_GROUP).map(AirplaneHit::Type)
        return mine + stock
    }

    /** Whether the registry's airplane is one of the pilot's own already. */
    fun isOwn(registration: AircraftRegistration, own: Collection<OwnRecord>): Boolean {
        val tail = "N" + registration.nNumber.uppercase().removePrefix("N")
        return own.any { it.tail.equals(tail, ignoreCase = true) }
    }

    /**
     * The Do group for a line: Direct To the first field or fix found where
     * the airplane's position is known, the screens the line names (by the
     * field's own words, FieldCommands, and by each screen's title), and
     * last the line asked of the assistant -- only where a model can answer
     * it (`asked`, AiOffered: Gemini Nano here).
     */
    fun actions(query: String, routed: Boolean, hasFix: Boolean, first: String?, asked: Boolean = true): List<DoAction> {
        val q = query.trim()
        if (q.isEmpty()) return emptyList()
        val out = mutableListOf<DoAction>()
        if (hasFix && first != null) out += DoAction.DirectTo(first)
        val screens = linkedSetOf<Screen>()
        (FieldCommands.readField(q) as? FieldCommand.Open)?.let { OpenScreen.screenOf(it.screen)?.let(screens::add) }
        val lower = q.lowercase()
        Screen.entries.filter { it in DOABLE && (it.title.lowercase().startsWith(lower) || it.title.lowercase().split(' ').any { w -> w.startsWith(lower) }) }
            .forEach(screens::add)
        screens.filter { routed || it !in NEEDS_ROUTE }.take(MAX_GROUP - 1).forEach { out += DoAction.Open(it) }
        if (asked) out += DoAction.Ask(q)
        return out
    }

    private val TAIL = Regex("^N[1-9][0-9A-Z]{0,4}$")

    /** The screens the Do group may offer: not the search itself (Airport),
     *  nor a shared flight, which needs its link. */
    private val DOABLE = Screen.entries.toSet() - setOf(Screen.AIRPORT, Screen.SHARED)

    /** The screens of a route, offered only with one. */
    private val NEEDS_ROUTE = setOf(Screen.BRIEF, Screen.NAVLOG, Screen.FPL)
}
