package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.sheet.MAP_SHEET_TAG
import app.wingtipmaps.android.ui.sheet.MapSheet
import app.wingtipmaps.android.ui.sheet.MapSheetState
import app.wingtipmaps.android.ui.sheet.rememberMapSheetState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The map's buttons on the phone's sheet (the owner, 2026-11-11: "just
 * above the search bar on the right"): they ride the sheet's top edge at
 * the right, the position button nearest the sheet as Google Maps' locate
 * button is, each takes its own tap, and they give way with the sheet all
 * the way up.
 */
@RunWith(AndroidJUnit4::class)
class MapButtonsOnSheetTest {
    @get:Rule
    val compose = createComposeRule()

    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var sheet: MapSheetState
    private lateinit var scope: CoroutineScope
    private var taps = 0
    private var asks = 0

    private fun host() {
        compose.setContent {
            WingtipTheme {
                sheet = rememberMapSheetState()
                scope = rememberCoroutineScope()
                MapSheet(
                    state = sheet,
                    peek = PEEK,
                    onTop = { MapButtons(ownShip = OwnShipMode.OFF, onOwnShip = { taps++ }, onAsk = { asks++ }, onLayers = {}, positionLast = true) },
                    body = { Box(Modifier.fillMaxSize()) },
                ) { Box(Modifier.weight(1f)) }
            }
        }
        compose.waitForIdle()
    }

    private val position get() = compose.onNode(hasContentDescription(context.getString(R.string.own_ship_button)))
    private val ask get() = compose.onNode(hasContentDescription(context.getString(R.string.ask_about_flight)))

    @Test
    fun theButtonsRideTheSheetsTopAtTheRight() {
        host()
        val content = compose.onNode(hasTestTag(MAP_SHEET_TAG)).getUnclippedBoundsInRoot()
        val root = compose.onRoot().getUnclippedBoundsInRoot()
        val mine = position.getUnclippedBoundsInRoot()
        // Over the sheet's top (its content's top less the stock handle's
        // 48 dp), and at the right edge.
        assertTrue("position at ${mine.bottom}, sheet at ${content.top}", mine.bottom < content.top - HANDLE)
        assertTrue(mine.bottom > content.top - HANDLE - 48.dp)
        assertTrue(root.right - mine.right < 24.dp)
        // The position button nearest the sheet, the sparkle over it.
        assertTrue(ask.getUnclippedBoundsInRoot().bottom <= mine.top)
    }

    @Test
    fun eachButtonTakesItsOwnTap() {
        host()
        position.performClick()
        ask.performClick()
        compose.runOnIdle {
            assertEquals(1, taps)
            assertEquals(1, asks)
        }
    }

    @Test
    fun theyGiveWayWithTheSheetAllTheWayUp() {
        host()
        compose.runOnIdle { scope.launch { sheet.expand() } }
        compose.waitUntil(TIMEOUT_MS) { compose.onAllNodes(hasContentDescription(context.getString(R.string.own_ship_button))).fetchSemanticsNodes().isEmpty() }
    }

    private companion object {
        val PEEK = 120.dp
        val HANDLE = 48.dp
        const val TIMEOUT_MS = 5_000L
    }
}
