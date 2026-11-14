package app.wingtipmaps.android.ui

import app.wingtipmaps.android.airplane.ProfileOpen
import app.wingtipmaps.android.map.MapPick
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * What the docked sheet shows (the card rule, the owner, 2026-11-10):
 * the carousel's two pages, the one search and what it shows with nothing
 * typed (Home), and the plan (Plan, the FPL page beside it); over them, one card for a thing -- a field, an airplane, a fix, a
 * VOR, an airspace, traffic, a leg of the route, the Map card --
 * or a page -- the Brief, the Nav Log, Nearest, Ask, You, Settings and
 * their pages, a checklist, Emergency -- each with its name and ← where the search was (CardPage).
 * Each card is a key of the sheet's back stack (MapViewModel), drawn by
 * Navigation 3's NavDisplay (SheetPagesHost) -- on a wide window in the
 * list-detail scene's detail pane -- so the stack outlives a rotation and
 * Back steps down it.
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

    /** The pilot's own card, the avatar's (the owner, 2026-11-13: three
     *  homes, You, Settings and the Map card). */
    @Serializable
    data object You : SheetPage

    /** You's first row: the account, its sign-in and its role's actions. */
    @Serializable
    data object PilotDetails : SheetPage

    @Serializable
    data object Minimums : SheetPage

    @Serializable
    data object Settings : SheetPage

    /** Settings' ATC: Comms Assist, the ATC alerts and the copilot. */
    @Serializable
    data object Atc : SheetPage

    /** Settings' Help & About. */
    @Serializable
    data object Help : SheetPage

    @Serializable
    data object Logbook : SheetPage

    /** You's Flights: the pilot's saved flights (the audit's AND-6). */
    @Serializable
    data object Flights : SheetPage

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

    /** The route's legs and totals, a card of its own rather than a part
     *  of the plan's page (the card rule's 3, the owner, 2026-11-11). */
    @Serializable
    data object NavLog : SheetPage

    /** The emergency assistant: on the sheet's stack as every card is,
     *  the one opened at the sheet's full height (the owner, 2026-11-13). */
    @Serializable
    data object Emergency : SheetPage

    @Serializable
    data object YourAirplanes : SheetPage

    /** An airplane's checklist, by the key it is kept under and its kind
     *  (ChecklistKind's name). */
    @Serializable
    data class Checklist(val airplane: String, val kind: String) : SheetPage

    /** A card or a page, which takes the carousel's place at the sheet's
     *  head (or the wide window's detail pane); Home and the plan are the
     *  carousel's pages. */
    val covers: Boolean get() = this != Home && this != Plan

    /** Whether it opens at the sheet's full height rather than at half:
     *  Emergency alone (the card rule's 2 and 4). */
    val opensFull: Boolean get() = this == Emergency

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
