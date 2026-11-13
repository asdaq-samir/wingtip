package app.wingtipmaps.android.ui

import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.wingtipmaps.android.MainActivity
import app.wingtipmaps.android.R
import app.wingtipmaps.android.emergency.EmergencyOpen
import app.wingtipmaps.android.firstflight.FirstFlightMemory
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.ui.sheet.CardPageTags
import app.wingtipmaps.android.ui.sheet.MAP_SHEET_TAG
import app.wingtipmaps.android.ui.sheet.SheetDetent
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The card rule and the scrolling rule (the owner, 2026-11-10), table
 * driven: every card in [CARDS] is opened from each of its ways in --
 * a link's name (ScreenRequests), a tap on the map or a list row
 * (CardRequests, which a map tap and a row go through), the one search's
 * words -- on the whole app, and each time the same checks run: the same
 * card by its test id, "← its name" where the search was and the search
 * gone, the sheet at half; ✕ closes it and so does ONE Back, back to the
 * search; scrolled to its end, its bar, ← and ✕ are still on screen. A
 * new card gets every check by a row. Instrumented, so CI's emulator
 * runs it (docs/NATIVE-ANDROID.md).
 */
@RunWith(AndroidJUnit4::class)
class CardRuleTest {
    @get:Rule
    val compose = createEmptyComposeRule()

    private lateinit var scenario: ActivityScenario<MainActivity>

    /** A way into a card. */
    sealed interface Way {
        fun open()

        /** A screen's name, as a link or a shortcut asks for it. */
        data class Link(val screen: Screen) : Way {
            override fun open() = ScreenRequests.ask(screen)
        }

        /** A tap on the map, a list's row or the plan's field: the card asked for. */
        data class Tap(val page: SheetPage) : Way {
            override fun open() = CardRequests.open(page)
        }

        /** Words typed in the one search and searched. */
        data class Typed(val words: String) : Way {
            override fun open() {}
        }
    }

    data class Card(val name: String, val page: SheetPage, val ways: List<Way>)

    @Before
    fun launch() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        FirstFlightMemory.of(context).markSeen()
        scenario = ActivityScenario.launch(MainActivity::class.java)
        compose.waitUntil(TIMEOUT_MS) { searchShown() }
    }

    @After
    fun finish() {
        EmergencyOpen.close()
        scenario.close()
    }

    private val hint: String get() = InstrumentationRegistry.getInstrumentation().targetContext.getString(R.string.search_hint)

    private fun searchShown() = compose.onAllNodes(hasText(hint)).fetchSemanticsNodes().isNotEmpty()

    private fun shown(card: Card) = compose.onAllNodes(hasTestTag(card.page.testId)).fetchSemanticsNodes().isNotEmpty()

    private fun bar(description: String): SemanticsNodeInteraction =
        compose.onNode(hasContentDescription(description) and hasAnyAncestor(hasTestTag(CardPageTags.BAR)), useUnmergedTree = true)

    private fun open(card: Card, way: Way) {
        when (way) {
            is Way.Typed -> {
                compose.onAllNodes(hasText(hint))[0].performClick()
                compose.onAllNodes(hasSetTextAction())[0].performTextInput(way.words)
                compose.onAllNodes(hasSetTextAction())[0].performImeAction()
            }
            else -> compose.runOnIdle { way.open() }
        }
        compose.waitUntil(TIMEOUT_MS) { shown(card) }
    }

    private fun back() {
        scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
    }

    private fun detent(): String? =
        compose.onNode(hasTestTag(MAP_SHEET_TAG), useUnmergedTree = true).fetchSemanticsNode().config.getOrNull(SheetDetent)

    @Test
    fun everyCardFromEveryWayInOpensTheSameCardOverTheSearch() {
        CARDS.forEach { card ->
            card.ways.forEach { way ->
                open(card, way)
                val at = "${card.name} by $way"
                // "← name" where the search was, and the search gone.
                bar(back).assertIsDisplayed()
                bar(close).assertIsDisplayed()
                compose.waitUntil(TIMEOUT_MS) { !searchShown() }
                // Every card opens at half (the sheet's peek while it is open).
                compose.waitUntil(TIMEOUT_MS) { detent() == "PartiallyExpanded" }
                assertEquals(at, "PartiallyExpanded", detent())
                // ✕ closes it, back to the search.
                bar(close).performClick()
                compose.waitUntil(TIMEOUT_MS) { !shown(card) && searchShown() }
            }
        }
    }

    @Test
    fun oneBackClosesEveryCardAndNeverJustLowersTheSheet() {
        CARDS.forEach { card ->
            open(card, card.ways.first())
            back()
            compose.waitUntil(TIMEOUT_MS) { !shown(card) && searchShown() }
        }
    }

    @Test
    fun theBarStaysInViewWhenACardIsScrolledToItsEnd() {
        CARDS.forEach { card ->
            open(card, card.ways.first())
            repeat(SWIPES) { compose.onNode(hasTestTag(card.page.testId)).performTouchInput { swipeUp() } }
            compose.waitForIdle()
            bar(back).assertIsDisplayed()
            bar(close).assertIsDisplayed()
            bar(close).performClick()
            compose.waitUntil(TIMEOUT_MS) { !shown(card) }
        }
    }

    @Test
    fun aPageOpenedInsideAPageComesBackToIt() {
        val settings = CARDS.first { it.page == SheetPage.Settings }
        open(settings, Way.Link(Screen.SETUP))
        val map = Card("Map", SheetPage.MapSettings, emptyList())
        compose.runOnIdle { CardRequests.open(SheetPage.MapSettings) }
        compose.waitUntil(TIMEOUT_MS) { shown(map) }
        back()
        compose.waitUntil(TIMEOUT_MS) { shown(settings) && !shown(map) }
        back()
        compose.waitUntil(TIMEOUT_MS) { !shown(settings) && searchShown() }
    }

    @Test
    fun youAndTheMapCardOpenSettingsByTheirGearsAndComeBack() {
        val you = CARDS.first { it.page == SheetPage.You }
        val settings = CARDS.first { it.page == SheetPage.Settings }
        val map = CARDS.first { it.page == SheetPage.MapSettings }
        listOf(you to YouTags.SETTINGS, map to MapCardTags.GEAR).forEach { (card, gear) ->
            open(card, card.ways.first())
            compose.onNode(hasTestTag(gear)).performClick()
            compose.waitUntil(TIMEOUT_MS) { shown(settings) }
            back()
            compose.waitUntil(TIMEOUT_MS) { shown(card) && !shown(settings) }
            back()
            compose.waitUntil(TIMEOUT_MS) { !shown(card) && searchShown() }
        }
    }

    @Test
    fun emergencyIsACardOnTheStackOpenedAtFullHeight() {
        // The owner, 2026-11-13: every card on the sheet's stack, Emergency
        // the one opened all the way up, its bar the cards' own.
        val emergency = Card("Emergency", SheetPage.Emergency, emptyList())
        compose.runOnIdle { EmergencyOpen.open(EmergencyOpen.From.LINK) }
        compose.waitUntil(TIMEOUT_MS) { shown(emergency) }
        bar(close).assertIsDisplayed()
        compose.waitUntil(TIMEOUT_MS) { detent() == "Expanded" }
        back()
        compose.waitUntil(TIMEOUT_MS) { !shown(emergency) && EmergencyOpen.from.value == null }
    }

    @Test
    fun theToggleStaysInSightOverACardAndClosesItAsItTurns() {
        val airport = CARDS.first()
        open(airport, airport.ways.first())
        compose.onNode(hasTestTag(PAGE_TOGGLE_TAG)).assertIsDisplayed().performClick()
        compose.waitUntil(TIMEOUT_MS) { !shown(airport) }
        // The FPL turned to: the toggle now offers the search back.
        compose.onNode(hasTestTag(PAGE_TOGGLE_TAG)).assertContentDescriptionEquals(text(R.string.show_search))
    }

    @Test
    fun signedOutYouSaysSignInOnce() {
        // The emulator's app is signed out: the head's Sign In is the
        // card's one name, with no "You" in its bar and nothing said again
        // on the rows it greys.
        val you = CARDS.first { it.page == SheetPage.You }
        open(you, you.ways.first())
        val signIn = text(R.string.you_sign_in)
        compose.waitUntil(TIMEOUT_MS) { compose.onAllNodes(hasText(signIn)).fetchSemanticsNodes().isNotEmpty() }
        assertEquals(1, compose.onAllNodes(hasText(signIn, substring = true)).fetchSemanticsNodes().size)
        assertEquals(0, compose.onAllNodes(hasText(text(R.string.you)) and hasAnyAncestor(hasTestTag(CardPageTags.BAR))).fetchSemanticsNodes().size)
    }

    private fun text(id: Int): String = InstrumentationRegistry.getInstrumentation().targetContext.getString(id)

    private val close: String get() = InstrumentationRegistry.getInstrumentation().targetContext.getString(R.string.close)
    private val back: String get() = InstrumentationRegistry.getInstrumentation().targetContext.getString(R.string.back)

    private companion object {
        const val TIMEOUT_MS = 10_000L
        const val SWIPES = 6

        /** Every card and page, with its ways in. */
        val CARDS = listOf(
            Card("Airport", SheetPage.Airport("KOSH"), listOf(Way.Tap(SheetPage.of(MapPick.Airport("KOSH"))), Way.Typed("about KOSH"))),
            Card("Airplane", SheetPage.Airplane(), listOf(Way.Link(Screen.AIRPLANE), Way.Typed("my airplane"))),
            Card(
                "Navaid",
                SheetPage.Thing(MapPick.Point("BAINY", vfr = true, lat = 46.1, lon = -92.4, vors = emptyList())),
                listOf(Way.Tap(SheetPage.of(MapPick.Point("BAINY", vfr = true, lat = 46.1, lon = -92.4, vors = emptyList())))),
            ),
            Card("Traffic", SheetPage.Thing(MapPick.Plane("a1b2c3")), listOf(Way.Tap(SheetPage.of(MapPick.Plane("a1b2c3"))))),
            // An approach plate tapped on the map: its card of settings.
            Card("Plate", SheetPage.Plate("KOSH", "I36"), listOf(Way.Tap(SheetPage.of(MapPick.Plate("KOSH", "I36"))))),
            // The Map card, the map's Layers button's (the owner, 2026-11-13).
            Card("Map", SheetPage.MapSettings, listOf(Way.Tap(SheetPage.MapSettings), Way.Typed("map settings"))),
            // You, the avatar's card.
            Card("You", SheetPage.You, listOf(Way.Tap(SheetPage.You))),
            Card("Brief", SheetPage.Brief, listOf(Way.Link(Screen.BRIEF))),
            // The Nav Log, a card of its own (the card rule's 3).
            Card("Nav Log", SheetPage.NavLog, listOf(Way.Link(Screen.NAVLOG))),
            Card("Nearest", SheetPage.Nearest, listOf(Way.Link(Screen.NEAREST), Way.Typed("nearest"))),
            Card("Settings", SheetPage.Settings, listOf(Way.Link(Screen.SETUP), Way.Typed("settings"))),
            Card("About", SheetPage.About, listOf(Way.Link(Screen.ABOUT))),
            Card("Ask", SheetPage.Ask, listOf(Way.Link(Screen.ASK))),
        )
    }
}
