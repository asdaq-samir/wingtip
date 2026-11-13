package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotFocused
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
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
 * The sheet's two pages (the owner, 2026-11-11 and 2026-11-13): the round
 * toggle in the map's left column turns between Search and the FPL,
 * saying where it goes to TalkBack, and a sideways swipe no longer does;
 * a page put away gives up the focus, so the keyboard goes down; a route
 * made brings the FPL page; and an upward drag on either page still
 * raises the sheet.
 */
@RunWith(AndroidJUnit4::class)
class SheetCarouselTest {
    @get:Rule
    val compose = createComposeRule()

    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var nav: SheetNav
    private lateinit var sheet: MapSheetState
    private fun host(field: Boolean = false) {
        compose.setContent {
            WingtipTheme {
                sheet = rememberMapSheetState()
                nav = rememberSheetNav(model = viewModel(), airports = viewModel(), onShown = {})
                MapSheet(
                    state = sheet, peek = PEEK, body = { Box(Modifier.fillMaxSize()) },
                    onTop = { SheetSideButtons(nav.planShown, onToggle = { if (nav.planShown) nav.closePlan() else nav.toPlanPage() }) },
                ) {
                    SheetPagesHost(
                        nav, backEnabled = true, modifier = Modifier.weight(1f),
                        home = { if (field) TextField(rememberTextFieldState(), Modifier.testTag(FIELD)) else Lines("search") },
                        plan = { Lines("plan") },
                        card = { Text(it.key) },
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    private val pager get() = compose.onNode(hasTestTag(SHEET_PAGER_TAG))

    private val toggle get() = compose.onNode(hasTestTag(PAGE_TOGGLE_TAG))

    private fun turnTo(page: Int) {
        if (nav.pager.currentPage != page) toggle.performClick()
    }

    private fun on(page: Int) = compose.waitUntil(TIMEOUT_MS) { nav.pager.currentPage == page && !nav.pager.isScrollInProgress }

    @Test
    fun theToggleTurnsThePagesAndSaysWhereItGoes() {
        host()
        toggle.assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf(context.getString(R.string.show_flight_plan))))
        toggle.performClick()
        on(PLAN_PAGE)
        assertEquals(SheetPage.Plan, nav.top)
        toggle.assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf(context.getString(R.string.show_search))))
        toggle.performClick()
        on(SEARCH_PAGE)
        assertEquals(SheetPage.Home, nav.top)
    }

    @Test
    fun aSidewaysSwipeTurnsNoPage() {
        host()
        pager.performTouchInput { swipeLeft() }
        compose.waitForIdle()
        assertEquals(SEARCH_PAGE, nav.pager.currentPage)
    }

    @Test
    fun leavingSearchLetsTheKeyboardGo() {
        host(field = true)
        compose.onNode(hasTestTag(FIELD)).performClick()
        compose.onNode(hasTestTag(FIELD)).assertIsFocused()
        toggle.performClick()
        on(PLAN_PAGE)
        compose.onNode(hasTestTag(FIELD)).assertIsNotFocused()
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
        turnTo(page)
        on(page)
        pager.performTouchInput { swipeUp() }
        compose.waitUntil(TIMEOUT_MS) { !sheet.atPeek }
        compose.onNode(hasTestTag(MAP_SHEET_TAG)).assert(SemanticsMatcher.expectValue(SheetDetent, "Expanded"))
        // Still on the page it was dragged on: an upward drag is not a swipe.
        assertEquals(page, nav.pager.currentPage)
    }

    private companion object {
        const val TIMEOUT_MS = 5_000L
        const val FIELD = "search-field"
        val PEEK = 200.dp
    }
}

/** A page's own list, long enough to scroll. */
@Composable
private fun Lines(name: String) {
    LazyColumn(Modifier.fillMaxSize()) { items(LINES) { Text("$name $it") } }
}

private const val LINES = 60
