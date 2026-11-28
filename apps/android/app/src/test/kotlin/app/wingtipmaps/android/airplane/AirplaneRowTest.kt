package app.wingtipmaps.android.airplane

import app.wingtipmaps.android.design.generated.CardAction
import app.wingtipmaps.android.design.generated.CardKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The airplane card's four buttons, as the web's: always four, one greyed where it does nothing. */
class AirplaneRowTest {
    private val ground = AirplaneRow.Can(airborne = false, trackable = false, flyable = true, flying = false, hex = "a1b2c3", keepable = true)

    @Test
    fun theRowIsItsStatesKind() {
        assertEquals(listOf(CardAction.FLY_THIS, CardAction.ALERTS, CardAction.FAVORITE, CardAction.FIGURES), AirplaneRow.kind(false).actions)
        assertEquals(CardKind.AIRPLANE_AIRBORNE, AirplaneRow.kind(true))
        assertEquals(CardAction.TRACK, AirplaneRow.kind(true).actions.first())
    }

    @Test
    fun anAirplaneThePlannerCannotFlyHasFlyThisAndFiguresGreyed() {
        val cannot = ground.copy(flyable = false)
        assertFalse(AirplaneRow.enabled(CardAction.FLY_THIS, cannot))
        assertFalse(AirplaneRow.enabled(CardAction.FIGURES, cannot))
        assertTrue(AirplaneRow.enabled(CardAction.ALERTS, cannot))
    }

    @Test
    fun theOneFlownHasFlyThisGreyedAndItsFiguresOpen() {
        val flown = ground.copy(flying = true)
        assertFalse(AirplaneRow.enabled(CardAction.FLY_THIS, flown))
        assertTrue(AirplaneRow.enabled(CardAction.FIGURES, flown))
    }

    @Test
    fun noIcaoAddressGreysAlertsAndNothingToKeepGreysFavorite() {
        val bare = ground.copy(hex = null, keepable = false)
        assertFalse(AirplaneRow.enabled(CardAction.ALERTS, bare))
        assertFalse(AirplaneRow.enabled(CardAction.FAVORITE, bare))
    }

    @Test
    fun trackOnlyWhileItIsHeard() {
        assertFalse(AirplaneRow.enabled(CardAction.TRACK, ground.copy(airborne = true)))
        assertTrue(AirplaneRow.enabled(CardAction.TRACK, ground.copy(airborne = true, trackable = true)))
    }

    @Test
    fun flyableIsAnNNumberWithABookOrThePilotsOrTheOneFlown() {
        assertTrue(AirplaneRow.flyable("N3429J", "pa28", owned = false, flying = false))
        assertTrue(AirplaneRow.flyable("N55GX", null, owned = true, flying = false))
        assertTrue(AirplaneRow.flyable("N55GX", null, owned = false, flying = true))
        // A registered type the planner has no book for, not the pilot's: no type is assumed.
        assertFalse(AirplaneRow.flyable("N55GX", null, owned = false, flying = false))
        assertFalse(AirplaneRow.flyable(null, "c172", owned = false, flying = false))
    }
}
