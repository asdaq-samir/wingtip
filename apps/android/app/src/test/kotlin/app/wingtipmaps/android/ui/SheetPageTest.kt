package app.wingtipmaps.android.ui

import app.wingtipmaps.android.airplane.ProfileOpen
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.ui.sheet.SwipeDown
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The sheet's pages as the back stacks keep them: each comes back from
 *  its key as it went in, every card and page covers the search, and a
 *  thing tapped opens its one card. */
class SheetPageTest {
    private val every = listOf(
        SheetPage.Home,
        SheetPage.Plan,
        SheetPage.Airport("KPAO"),
        SheetPage.Airplane("N12345", focus = "glide"),
        SheetPage.Airplane(null, type = "C172"),
        SheetPage.Airplane(),
        SheetPage.Thing(MapPick.Plane("a1b2c3")),
        SheetPage.Thing(MapPick.Here(44.9, -93.2)),
        SheetPage.Thing(MapPick.Point("BAINY", vfr = true, lat = 46.1, lon = -92.4, vors = emptyList())),
        SheetPage.Leg(2),
        SheetPage.Plate("KOSH", "I36"),
        SheetPage.MapSettings,
        SheetPage.Brief,
        SheetPage.Nearest,
        SheetPage.Ask,
        SheetPage.You,
        SheetPage.PilotDetails,
        SheetPage.Minimums,
        SheetPage.Settings,
        SheetPage.Atc,
        SheetPage.Help,
        SheetPage.Logbook,
        SheetPage.Coach,
        SheetPage.Downloads,
        SheetPage.Passengers,
        SheetPage.About,
        SheetPage.Clearance,
        SheetPage.Profile,
        SheetPage.NavLog,
        SheetPage.Emergency,
        SheetPage.YourAirplanes,
        SheetPage.Checklist("C172", "NORMAL"),
    )

    @Test
    fun everyPageComesBackFromItsKey() {
        every.forEach { assertEquals(it, SheetPage.of(it.key)) }
    }

    @Test
    fun aKeyNotReadIsHome() {
        assertEquals(SheetPage.Home, SheetPage.of("airport:KPAO"))
    }

    @Test
    fun everyCardAndPageCoversTheSearchButHomeAndThePlan() {
        assertFalse(SheetPage.Home.covers)
        assertFalse(SheetPage.Plan.covers)
        every.drop(2).forEach { assertTrue("$it covers", it.covers) }
        assertTrue(SheetPage.of(ProfileOpen.At("N1", null, null)).covers)
    }

    @Test
    fun aThingTappedOpensItsOneCard() {
        assertEquals(SheetPage.Airport("KOSH"), SheetPage.of(MapPick.Airport("KOSH")))
        assertEquals(SheetPage.Leg(1), SheetPage.of(MapPick.RouteLeg(1)))
        assertEquals(SheetPage.Plate("KOSH", "I36"), SheetPage.of(MapPick.Plate("KOSH", "I36")))
        assertEquals(SheetPage.Thing(MapPick.Plane("abc")), SheetPage.of(MapPick.Plane("abc")))
    }

    @Test
    fun eachKindOfCardHasItsOwnStableTestId() {
        assertEquals("card-airport", SheetPage.Airport("KOSH").testId)
        assertEquals(SheetPage.Airport("KOSH").testId, SheetPage.Airport("KMSN").testId)
        assertEquals("card-mapsettings", SheetPage.MapSettings.testId)
        assertEquals(every.size - 4, every.map { it.testId }.toSet().size)
    }

    @Test
    fun emergencyAloneOpensAtFullHeight() {
        assertEquals(listOf(SheetPage.Emergency), every.filter { it.opensFull })
    }

    /** The card rule's 10 (the owner, 2026-11-14): a settings card comes
     *  from full to half on a swipe down and closes from half; a content
     *  card parks at its bar and never closes; the search and the plan
     *  never hide. */
    @Test
    fun aSwipeDownClosesASettingsCardOnlyFromHalfAndParksTheRest() {
        for (page in listOf(SheetPage.You, SheetPage.Settings, SheetPage.MapSettings)) {
            assertEquals(SwipeDown.Lower, page.swipeDown(fromFull = true, parked = false))
            assertEquals(SwipeDown.Close, page.swipeDown(fromFull = false, parked = false))
        }
        for (page in listOf(SheetPage.Airport("KOSH"), SheetPage.Emergency, SheetPage.NavLog, SheetPage.Thing(MapPick.Plane("abc")))) {
            assertEquals(SwipeDown.Park, page.swipeDown(fromFull = true, parked = false))
            assertEquals(SwipeDown.Park, page.swipeDown(fromFull = false, parked = false))
            assertEquals(SwipeDown.Hold, page.swipeDown(fromFull = false, parked = true))
        }
        assertEquals(SwipeDown.Hold, SheetPage.Home.swipeDown(fromFull = true, parked = false))
        assertEquals(SwipeDown.Hold, SheetPage.Plan.swipeDown(fromFull = false, parked = false))
    }
}
