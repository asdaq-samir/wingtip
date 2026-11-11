package app.wingtipmaps.android.ui

import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.toRoute
import app.wingtipmaps.android.airplane.ProfileOpen
import app.wingtipmaps.android.map.MapPick
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * What the docked sheet shows (the card rule, the owner, 2026-11-10):
 * under the one search, what it shows with nothing typed (Home) or the
 * plan; over it, one card for a thing -- a field, an airplane, a fix, a
 * VOR, an airspace, traffic, a leg of the route, the map's settings --
 * or a page -- the Brief, Nearest, Ask, Settings and its pages, a
 * checklist -- each with its name and ← where the search was (CardPage).
 * Each is a route of the sheet's NavHost (SheetPagesHost) or, on a wide
 * window, of the detail pane, so the system keeps the stack across a
 * rotation and Back steps down it.
 */
@Serializable
sealed interface SheetPage {
    @Serializable
    data object Home : SheetPage

    @Serializable
    data object Plan : SheetPage

    @Serializable
    data class Airport(val ident: String) : SheetPage

    /** An airplane's card, by its N-number or a type with none (ProfileOpen's);
     *  with neither, the airplane flown now, where it is picked. */
    @Serializable
    data class Airplane(val tail: String? = null, val focus: String? = null, val type: String? = null) : SheetPage {
        val at: ProfileOpen.At get() = ProfileOpen.At(tail, focus, type)
    }

    /** A thing tapped on the map or asked for elsewhere (CardRequests): a
     *  VOR, a fix, an airspace, traffic or What's Here. */
    @Serializable
    data class Thing(val pick: MapPick) : SheetPage

    /** A leg of the route, from the map's line, the nav log or the strip:
     *  its number from the departure (RouteLegModel). */
    @Serializable
    data class Leg(val index: Int) : SheetPage

    /** An approach plate on the map: its card, how it is drawn (PlateCard). */
    @Serializable
    data class Plate(val ident: String, val procedure: String) : SheetPage

    @Serializable
    data object MapSettings : SheetPage

    @Serializable
    data object Brief : SheetPage

    @Serializable
    data object Nearest : SheetPage

    @Serializable
    data object Ask : SheetPage

    @Serializable
    data object Settings : SheetPage

    @Serializable
    data object Logbook : SheetPage

    @Serializable
    data object Coach : SheetPage

    @Serializable
    data object Downloads : SheetPage

    @Serializable
    data object Passengers : SheetPage

    @Serializable
    data object About : SheetPage

    @Serializable
    data object Clearance : SheetPage

    /** The route from the side, its altitude slider and each waypoint's altitude. */
    @Serializable
    data object Profile : SheetPage

    @Serializable
    data object YourAirplanes : SheetPage

    /** An airplane's checklist, by the key it is kept under and its kind
     *  (ChecklistKind's name). */
    @Serializable
    data class Checklist(val airplane: String, val kind: String) : SheetPage

    /** A card or a page, which takes the search's place at the sheet's
     *  head (or the wide window's detail pane); Home and the plan sit
     *  under the search. */
    val covers: Boolean get() = this != Home && this != Plan

    /** The card's stable test id, the same whatever opened it (the card
     *  rule's UI tests: "card-airport", "card-settings"). */
    val testId: String get() = "card-" + (this::class.simpleName ?: "page").lowercase()

    /** The page as a back stack keeps it (a saveable string). */
    val key: String get() = KeyJson.encodeToString(serializer(), this)

    companion object {
        // "page" names the kind, as the airplane's own `type` is taken.
        private val KeyJson = Json { classDiscriminator = "page" }

        fun of(key: String): SheetPage = runCatching { KeyJson.decodeFromString(serializer(), key) }.getOrDefault(Home)

        fun of(at: ProfileOpen.At): SheetPage = Airplane(at.tail, at.focus, at.type)

        /** The card a tap on the map, or a thing asked for elsewhere, opens. */
        fun of(pick: MapPick): SheetPage = when (pick) {
            is MapPick.Airport -> Airport(pick.ident)
            is MapPick.RouteLeg -> Leg(pick.index)
            is MapPick.Plate -> Plate(pick.ident, pick.procedure)
            else -> Thing(pick)
        }
    }
}

/** A card or a page on the NavHost's stack, by its key (SheetPage.key):
 *  one route for them all, so a new card needs no route of its own. */
@Serializable
internal data class CardRoute(val key: String)

/** The page a back stack entry of the sheet's NavHost shows. */
internal fun NavBackStackEntry.page(): SheetPage = when {
    destination.hasRoute<SheetPage.Plan>() -> SheetPage.Plan
    destination.hasRoute<CardRoute>() -> SheetPage.of(toRoute<CardRoute>().key)
    else -> SheetPage.Home
}
