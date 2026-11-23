package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.wingtipmaps.android.LargeScreen
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The wide window's panes (WidePanes, PaneRoom) at the sizes Android's
 * large-screen guidelines test on, laid out at that size on any emulator:
 * a 10.5-inch tablet on its side (1280 x 800 dp) keeps the panel, the map
 * and a field's card side by side, the card at the end; an 8-inch one
 * (1024 x 640) puts the panel away while the card is up and brings it
 * back for a page opened by name; a medium window (700 dp) shows the card
 * in the panel's place, with no pane of its own.
 */
@LargeScreen
@RunWith(AndroidJUnit4::class)
class WidePanesTest {
    @get:Rule
    val compose = createComposeRule()

    private lateinit var sheet: SheetNav
    private var width by mutableStateOf(1280.dp)

    private fun host(at: Dp, height: Dp = 800.dp) {
        width = at
        compose.setContent {
            WingtipTheme {
                sheet = rememberSheetNav(model = viewModel(), airports = viewModel(), onShown = {})
                Box(Modifier.requiredSize(width, height)) {
                    WidePanes(sheet, searchAsks = 0, pages = { modifier, part, _, _ -> Page(modifier, part) }, map = { Text("map") })
                }
            }
        }
        compose.waitForIdle()
    }

    @Composable
    private fun Page(modifier: Modifier, part: List<SheetPage>) = Box(modifier) { Text("top " + part.last().testId) }

    private fun exists(tag: String) = compose.onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isNotEmpty()

    private fun inPane(tag: String, page: SheetPage) =
        compose.onAllNodes(hasText("top " + page.testId) and hasAnyAncestor(hasTestTag(tag))).fetchSemanticsNodes().isNotEmpty()

    private fun waitFor(what: () -> Boolean) = compose.waitUntil(TIMEOUT_MS, what)

    @Test
    fun aTenInchTabletKeepsThePanelTheMapAndTheCardSideBySide() {
        host(1280.dp)
        assertTrue(exists(PANEL_TAG))
        compose.runOnIdle { sheet.show(SheetPage.Airport("KMSN")) }
        waitFor { inPane(CARD_PANE_TAG, SheetPage.Airport("KMSN")) }
        assertTrue(inPane(PANEL_TAG, SheetPage.Home))
        val panel = compose.onNode(hasTestTag(PANEL_TAG)).getBoundsInRoot()
        val card = compose.onNode(hasTestTag(CARD_PANE_TAG)).getBoundsInRoot()
        val map = compose.onNode(hasText("map")).getBoundsInRoot()
        // The map between the two, at least a panel's width.
        assertTrue(panel.right <= map.left && map.right <= card.left)
        assertTrue(card.left - panel.right >= 384.dp)
        // Back closes the card, and its pane goes.
        compose.runOnIdle { sheet.back() }
        waitFor { !exists(CARD_PANE_TAG) }
    }

    @Test
    fun anEightInchTabletPutsThePanelAwayForACardOnly() {
        host(1024.dp, 640.dp)
        compose.runOnIdle { sheet.show(SheetPage.Airport("KOSH")) }
        waitFor { inPane(CARD_PANE_TAG, SheetPage.Airport("KOSH")) && !exists(PANEL_TAG) }
        // A page opened from the card comes in the panel, the card beside it.
        compose.runOnIdle { sheet.push(SheetPage.Brief) }
        waitFor { inPane(PANEL_TAG, SheetPage.Brief) && inPane(CARD_PANE_TAG, SheetPage.Airport("KOSH")) }
        compose.runOnIdle { sheet.closeAll() }
        waitFor { inPane(PANEL_TAG, SheetPage.Home) && !exists(CARD_PANE_TAG) }
    }

    @Test
    fun aMediumWindowShowsTheCardInThePanelsPlace() {
        host(700.dp)
        compose.runOnIdle { sheet.show(SheetPage.Airport("KJVL")) }
        waitFor { inPane(PANEL_TAG, SheetPage.Airport("KJVL")) }
        assertTrue(!exists(CARD_PANE_TAG))
    }

    @Test
    fun theCardStaysAcrossAResize() {
        host(1280.dp)
        compose.runOnIdle { sheet.show(SheetPage.Leg(1)) }
        waitFor { inPane(CARD_PANE_TAG, SheetPage.Leg(1)) }
        compose.runOnIdle { width = 700.dp }
        waitFor { inPane(PANEL_TAG, SheetPage.Leg(1)) }
        compose.runOnIdle { width = 1280.dp }
        waitFor { inPane(CARD_PANE_TAG, SheetPage.Leg(1)) }
    }

    private companion object {
        const val TIMEOUT_MS = 5_000L
    }
}
