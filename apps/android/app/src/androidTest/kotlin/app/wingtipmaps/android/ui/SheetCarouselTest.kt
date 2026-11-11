package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.swipeRight
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.sheet.MAP_SHEET_TAG
import app.wingtipmaps.android.ui.sheet.MapSheet
import app.wingtipmaps.android.ui.sheet.MapSheetState
import app.wingtipmaps.android.ui.sheet.SheetDetent
import app.wingtipmaps.android.ui.sheet.rememberMapSheetState
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The sheet's carousel (the owner, 2026-11-11): a sideways swipe moves
 * between Search and the FPL and the dots follow and take a tap, saying
 * which page to TalkBack; the FPL with no route says "Plan a Flight" and
 * its button asks for the one search; a route made brings the FPL page;
 * and an upward drag on either page still raises the sheet.
 */
@RunWith(AndroidJUnit4::class)
class SheetCarouselTest {
    @get:Rule
    val compose = createComposeRule()

    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var nav: SheetNav
    private lateinit var sheet: MapSheetState
    private var searches = 0
    private var samples = 0

    private fun host(routed: Boolean = true) {
        compose.setContent {
            WingtipTheme {
                sheet = rememberMapSheetState()
                nav = rememberSheetNav(wide = false, airports = viewModel(), onShown = {})
                MapSheet(state = sheet, peek = PEEK, body = { Box(Modifier.fillMaxSize()) }) {
                    SheetPagesHost(
                        nav, backEnabled = true, modifier = Modifier.weight(1f),
                        home = { Lines("search") },
                        plan = { if (routed) Lines("plan") else PlanEmpty(onSearch = { searches++ }, onSample = { samples++ }) },
                        card = { Text(it.key) },
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    private val pager get() = compose.onNode(hasTestTag(SHEET_PAGER_TAG))

    private fun dot(page: Int) = compose.onNode(hasTestTag(SHEET_DOT_TAG + page))

    private fun on(page: Int) = compose.waitUntil(TIMEOUT_MS) { nav.pager.currentPage == page && !nav.pager.isScrollInProgress }

    @Test
    fun aSwipeMovesBetweenThePagesAndTheDotsFollow() {
        host()
        dot(0).assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, true))
        pager.performTouchInput { swipeLeft() }
        on(PLAN_PAGE)
        dot(1).assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, true))
        assertEquals(SheetPage.Plan, nav.shown)
        pager.performTouchInput { swipeRight() }
        on(SEARCH_PAGE)
        assertEquals(SheetPage.Home, nav.shown)
        dot(1).performClick()
        on(PLAN_PAGE)
        dot(0).performClick()
        on(SEARCH_PAGE)
    }

    @Test
    fun theDotsSayWhichPage() {
        host()
        val words = context.getString(R.string.sheet_page_of, 1, 2, context.getString(R.string.sheet_page_search))
        dot(0).assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf(words)))
    }

    @Test
    fun noRouteSaysPlanAFlightAndItsButtonAsksForTheSearch() {
        host(routed = false)
        dot(1).performClick()
        on(PLAN_PAGE)
        compose.onNode(hasText(context.getString(R.string.plan_a_flight))).assertExists()
        compose.onNode(hasText(context.getString(R.string.plan_a_flight_search))).performClick()
        compose.runOnIdle { assertEquals(1, searches) }
        compose.onNode(hasText(context.getString(R.string.welcome_sample))).performClick()
        compose.runOnIdle { assertEquals(1, samples) }
    }

    @Test
    fun aRouteMadeBringsTheFplPageAndACardComesBackToIt() {
        host()
        compose.runOnIdle { nav.toPlanPage() }
        on(PLAN_PAGE)
        compose.runOnIdle { nav.show(SheetPage.Airport("KOSH")) }
        compose.waitUntil(TIMEOUT_MS) { nav.top == SheetPage.Airport("KOSH") }
        compose.runOnIdle { nav.back() }
        compose.waitUntil(TIMEOUT_MS) { nav.top == SheetPage.Plan }
    }

    @Test
    fun anUpwardDragStillRaisesTheSheetOnSearch() = raisedOn(SEARCH_PAGE)

    @Test
    fun anUpwardDragStillRaisesTheSheetOnTheFpl() = raisedOn(PLAN_PAGE)

    private fun raisedOn(page: Int) {
        host()
        dot(page).performClick()
        on(page)
        pager.performTouchInput { swipeUp() }
        compose.waitUntil(TIMEOUT_MS) { !sheet.atPeek }
        compose.onNode(hasTestTag(MAP_SHEET_TAG)).assert(SemanticsMatcher.expectValue(SheetDetent, "Expanded"))
        // Still on the page it was dragged on: an upward drag is not a swipe.
        assertEquals(page, nav.pager.currentPage)
    }

    private companion object {
        const val TIMEOUT_MS = 5_000L
        val PEEK = 200.dp
    }
}

/** A page's own list, long enough to scroll. */
@Composable
private fun Lines(name: String) {
    LazyColumn(Modifier.fillMaxSize()) { items(LINES) { Text("$name $it") } }
}

private const val LINES = 60
