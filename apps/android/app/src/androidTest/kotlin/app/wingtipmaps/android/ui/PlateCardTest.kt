package app.wingtipmaps.android.ui

import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.wingtipmaps.android.MainActivity
import app.wingtipmaps.android.R
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.plates.PlatePick
import app.wingtipmaps.android.plates.PlatesOnMap
import app.wingtipmaps.android.welcome.WelcomeMemory
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A plate tapped on the map opens its card, and the card's Hide Plate
 * takes the plate off the map and closes the card, back to the search
 * (the owner, 2026-11-11: ForeFlight's plate card). The tap goes through
 * CardRequests, as the map's tap does (MapPick.Plate). Instrumented, so
 * CI's emulator runs it.
 */
@RunWith(AndroidJUnit4::class)
class PlateCardTest {
    @get:Rule
    val compose = createEmptyComposeRule()

    private lateinit var scenario: ActivityScenario<MainActivity>
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Before
    fun launch() {
        WelcomeMemory.of(context).markSeen()
        scenario = ActivityScenario.launch(MainActivity::class.java)
        compose.waitUntil(TIMEOUT_MS) { shown(hasText(context.getString(R.string.search_hint))) }
    }

    @After
    fun finish() = scenario.close()

    private fun shown(matcher: androidx.compose.ui.test.SemanticsMatcher) = compose.onAllNodes(matcher).fetchSemanticsNodes().isNotEmpty()

    @Test
    fun aPlateTappedOpensItsCardAndHidePlateTakesItOff() {
        val pick = PlatePick("KOSH", "I36")
        val page = SheetPage.of(MapPick.Plate(pick.ident, pick.procedure))
        compose.runOnIdle { CardRequests.open(page) }
        compose.waitUntil(TIMEOUT_MS) { shown(hasTestTag(page.testId)) }
        // The card's settings, as ForeFlight's.
        compose.onNode(hasText(context.getString(R.string.plate_annotations))).fetchSemanticsNode()
        compose.onNode(hasText(context.getString(R.string.plate_invert))).fetchSemanticsNode()
        compose.onNode(hasText(context.getString(R.string.plate_hide))).performClick()
        compose.waitUntil(TIMEOUT_MS) { !shown(hasTestTag(page.testId)) }
        assertTrue(pick in PlatesOnMap.shared.state.value.hidden)
    }

    private companion object {
        const val TIMEOUT_MS = 10_000L
    }
}
