package app.wingtipmaps.android.ui

import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.map.MapPick
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** How a wide window shares itself (PaneRoom): a card in its own pane
 *  from expanded width, the panel giving way where the panel, a card and
 *  the map do not fit, and which pages are things' cards. */
class PaneRoomTest {
    @Test
    fun aCardHasItsOwnPaneFromExpandedWidth() {
        assertFalse(PaneRoom.supportingPane(839.dp))
        assertTrue(PaneRoom.supportingPane(840.dp))
        // Android's large-screen test devices: an 8-inch and a 10.5-inch
        // tablet on their sides, a 4:3 foldable open.
        assertTrue(PaneRoom.supportingPane(1024.dp))
        assertTrue(PaneRoom.supportingPane(1280.dp))
    }

    @Test
    fun thePanelGivesWayWhereThreeDoNotFit() {
        val card = SheetPage.Airport("KMSN")
        // A 10.5-inch tablet on its side keeps all three.
        assertTrue(PaneRoom.panelShown(card, 1280.dp, askedOver = null))
        // An 8-inch tablet on its side, or a foldable open: the map would
        // be narrower than a phone between them.
        assertFalse(PaneRoom.panelShown(card, 1024.dp, askedOver = null))
        // The search asked for over that card brings it back.
        assertTrue(PaneRoom.panelShown(card, 1024.dp, askedOver = card))
        assertFalse(PaneRoom.panelShown(card, 1024.dp, askedOver = SheetPage.Airport("KOSH")))
        // A page opened by name is the panel's, so it always shows.
        assertTrue(PaneRoom.panelShown(SheetPage.Brief, 900.dp, askedOver = null))
        assertTrue(PaneRoom.panelShown(SheetPage.Home, 900.dp, askedOver = null))
    }

    @Test
    fun theStackSplitsIntoThePanelsPagesAndTheThingsCards() {
        val leg = SheetPage.Leg(2)
        val stack = listOf(SheetPage.Home, SheetPage.Airport("KMSN"), SheetPage.Brief, leg)
        assertEquals(listOf(SheetPage.Home, SheetPage.Brief), PaneRoom.panelStack(stack))
        assertEquals(listOf(SheetPage.Airport("KMSN"), leg), PaneRoom.cardStack(stack))
    }

    @Test
    fun thingsAreCardsAndPagesAreThePanels() {
        assertTrue(SheetPage.Airport("KORD").inspects)
        assertTrue(SheetPage.Airplane("N12345").inspects)
        assertTrue(SheetPage.Thing(MapPick.Here(43.1, -89.3)).inspects)
        assertTrue(SheetPage.Leg(0).inspects)
        assertTrue(SheetPage.Plate("KMSN", "R36").inspects)
        listOf(SheetPage.Home, SheetPage.Plan, SheetPage.Brief, SheetPage.NavLog, SheetPage.You, SheetPage.Settings, SheetPage.Emergency)
            .forEach { assertFalse(it.toString(), it.inspects) }
    }

    @Test
    fun aDraggedPaneKeepsWithinWhatTheWindowHas() {
        // Dragged narrower than three quarters of a panel: held there.
        assertEquals(PaneRoom.LEAST_PANE, PaneRoom.paneWidth(100.dp, 1280.dp, 2))
        // Dragged wider than the window shares out, the map keeping a
        // panel's 384 dp: (1280 - 384) / 2 for two panes.
        assertEquals(448.dp, PaneRoom.paneWidth(900.dp, 1280.dp, 2))
        // One panel on a medium window: all but the map's panel width.
        assertEquals(316.dp, PaneRoom.paneWidth(500.dp, 700.dp, 1))
        // In between, as dragged.
        assertEquals(400.dp, PaneRoom.paneWidth(400.dp, 1280.dp, 2))
    }
}
