package app.wingtipmaps.android.ui

import android.view.KeyEvent
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.wingtipmaps.android.LargeScreen
import app.wingtipmaps.android.MainActivity
import app.wingtipmaps.android.firstflight.FirstFlightMemory
import app.wingtipmaps.android.navigation.CardRequests
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The whole app in an expanded window (CI's tablet emulator; skipped on a
 * narrower one): the panel and the map, no docked sheet; a field's card
 * in its pane at the end, closed by one Back; Ctrl+B's Brief in the panel
 * beside it; Esc with nothing open keeps the app in front.
 */
@LargeScreen
@RunWith(AndroidJUnit4::class)
class TabletLayoutTest {
    @get:Rule
    val compose = createEmptyComposeRule()

    private lateinit var scenario: ActivityScenario<MainActivity>

    @Before
    fun launch() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        FirstFlightMemory.of(context).markSeen()
        scenario = ActivityScenario.launch(MainActivity::class.java)
        var widthDp = 0
        scenario.onActivity { widthDp = it.resources.configuration.screenWidthDp }
        assumeTrue("an expanded window, 840 dp and up", widthDp >= EXPANDED_DP)
        compose.waitUntil(TIMEOUT_MS) { exists(PANEL_TAG) }
    }

    @After
    fun finish() = scenario.close()

    private fun exists(tag: String) = compose.onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isNotEmpty()

    private fun shownIn(pane: String, page: SheetPage) =
        compose.onAllNodes(hasTestTag(page.testId) and hasAnyAncestor(hasTestTag(pane))).fetchSemanticsNodes().isNotEmpty()

    /** A key pressed, as the window hands it on unused: whether it took it. */
    private fun key(code: Int, meta: Int): Boolean {
        var taken = false
        scenario.onActivity {
            val down = KeyEvent(0, 0, KeyEvent.ACTION_DOWN, code, 0, meta)
            taken = if (meta == 0) it.onKeyDown(code, down) else it.onKeyShortcut(code, down)
        }
        return taken
    }

    @Test
    fun aFieldsCardOpensBesideTheMapAndOneBackClosesIt() {
        val card = SheetPage.Airport("KORD")
        compose.runOnIdle { CardRequests.open(card) }
        compose.waitUntil(TIMEOUT_MS) { shownIn(CARD_PANE_TAG, card) }
        scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        compose.waitUntil(TIMEOUT_MS) { !exists(CARD_PANE_TAG) && exists(PANEL_TAG) }
    }

    @Test
    fun ctrlBOpensTheBriefInThePanel() {
        assertTrue(key(KeyEvent.KEYCODE_B, KeyEvent.META_CTRL_ON))
        compose.waitUntil(TIMEOUT_MS) { shownIn(PANEL_TAG, SheetPage.Brief) }
        // With a page open Esc is left to become Back (the system's fallback).
        assertFalse(key(KeyEvent.KEYCODE_ESCAPE, 0))
        scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        compose.waitUntil(TIMEOUT_MS) { !shownIn(PANEL_TAG, SheetPage.Brief) }
        // With nothing to close it is kept, so the app stays in front.
        compose.waitForIdle()
        assertTrue(key(KeyEvent.KEYCODE_ESCAPE, 0))
    }

    private companion object {
        const val TIMEOUT_MS = 10_000L
        const val EXPANDED_DP = 840
    }
}
