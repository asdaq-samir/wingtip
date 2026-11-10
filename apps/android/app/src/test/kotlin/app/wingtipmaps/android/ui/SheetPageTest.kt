package app.wingtipmaps.android.ui

import app.wingtipmaps.android.airplane.ProfileOpen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The sheet's pages as the wide panes' navigator keeps them: each comes
 *  back from its key as it went in, and only a field's or an airplane's
 *  card goes to the detail pane. */
class SheetPageTest {
    @Test
    fun everyPageComesBackFromItsKey() {
        val pages = listOf(
            SheetPage.Home,
            SheetPage.Plan,
            SheetPage.Airport("KPAO"),
            SheetPage.Airplane("N12345", focus = "glide"),
            SheetPage.Airplane(null, type = "C172"),
        )
        pages.forEach { assertEquals(it, SheetPage.of(it.key)) }
    }

    @Test
    fun aKeyNotReadIsHome() {
        assertEquals(SheetPage.Home, SheetPage.of("airport:KPAO"))
    }

    @Test
    fun cardsAreTheFieldAndTheAirplane() {
        assertTrue(SheetPage.Airport("KSQL").isCard)
        assertTrue(SheetPage.of(ProfileOpen.At("N1", null, null)).isCard)
        assertFalse(SheetPage.Home.isCard)
        assertFalse(SheetPage.Plan.isCard)
    }
}
