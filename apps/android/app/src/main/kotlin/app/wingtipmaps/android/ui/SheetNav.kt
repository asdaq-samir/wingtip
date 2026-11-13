package app.wingtipmaps.android.ui

import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.airplane.ProfileOpen
import app.wingtipmaps.android.emergency.EmergencyOpen
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch

/**
 * Where the docked sheet's cards and pages are (the card rule, the owner,
 * 2026-11-10): the map screen's back stack (MapViewModel), which
 * Navigation 3's NavDisplay draws (SheetPagesHost) in every layout -- on a
 * tablet or an unfolded phone as Material's list-detail scene, the cards
 * in its detail pane -- so Back and its predictive gesture are the stock
 * ones.
 *
 * Home is the sheet's carousel (the owner, 2026-11-11, rules.md): two
 * pages side by side in Compose's own pager ([pager]), Search -- the one
 * search and what it shows with nothing typed -- and the FPL, the plan.
 * A card opens over both and ✕ comes back to the page it was opened from,
 * as the pager's state outlives the cards over it.
 */
@Stable
class SheetNav internal constructor(
    private val model: MapViewModel,
    /** The carousel's pager under the cards: [SEARCH_PAGE] or [PLAN_PAGE]. */
    val pager: PagerState,
    private val scope: CoroutineScope,
) {
    // The sheet brought to where the page shown opens: a card shown from
    // the search or the map at half, the plan raised from the peek; a card
    // pushed from inside another leaves the sheet where it is.
    internal var onShown: (SheetPage) -> Unit = {}

    /** The back stack NavDisplay draws. */
    val stack: SnapshotStateList<SheetPage> get() = model.stack

    /** The page on top: a card, else the carousel's page in view. */
    val top: SheetPage get() = model.top.let { if (it == SheetPage.Home && planShown) SheetPage.Plan else it }

    /** Whether the carousel is at the plan, on top or under the cards. */
    val planShown: Boolean get() = pager.currentPage == PLAN_PAGE

    /** Whether a card or a page covers the search. */
    val covered: Boolean get() = top.covers

    /** `page` shown from the map, the search or a link: the cards over
     *  the search closed first, so it is the one card there. */
    fun show(page: SheetPage) {
        model.show(page)
        if (!page.covers) scope.launch { pager.animateScrollToPage(if (page == SheetPage.Plan) PLAN_PAGE else SEARCH_PAGE) }
        onShown(page)
    }

    /** `page` opened from inside a card or a page, on top of it, so Back
     *  comes back to it. It keeps the sheet's height (the owner's decision,
     *  2026-11-10, on the audit's SC-1): only a card shown from the search
     *  or the map brings the sheet to half, so `onShown` is not told of a
     *  card pushed over another -- but for Emergency, which opens at full
     *  height wherever it is opened from. */
    fun push(page: SheetPage) {
        if (!page.covers) return show(page)
        model.push(page)
        if (page.opensFull) onShown(page)
    }

    /** A page asked for by its name: on top of the page it was asked from,
     *  else shown as the one card. */
    fun open(page: SheetPage) = if (covered && page.covers) push(page) else show(page)

    /** Back one level: the card on top closed. */
    fun back() = model.back()

    /** Every card and page closed, back to the search and what is under it. */
    fun closeAll() = model.closeAll()

    /** The plan's ✕: the carousel back at the Search page, the cards over
     *  it, if any, left as they are. */
    fun closePlan() {
        scope.launch { pager.animateScrollToPage(SEARCH_PAGE) }
    }

    /** The round toggle under the 3D (SheetSideButtons): every card
     *  closed, and the carousel turned from the page under them to the
     *  other (the owner, 2026-11-13: the toggle stays in sight while a
     *  card is open). */
    fun togglePage() {
        closeAll()
        if (planShown) closePlan() else toPlanPage()
    }

    /** The carousel at the plan's page, the cards over it left as they
     *  are: a route made or opened from anywhere (the carousel's rule). */
    fun toPlanPage() {
        scope.launch { pager.animateScrollToPage(PLAN_PAGE) }
    }
}

/**
 * The sheet's pages for the root, over the map screen's `model`: an
 * airplane's card asked for anywhere (ProfileOpen) opened as a card, and
 * the map's ring round a field let go once its card is closed.
 */
@Composable
fun rememberSheetNav(model: MapViewModel, airports: AirportModel, onShown: (SheetPage) -> Unit): SheetNav {
    val pager = rememberPagerState(initialPage = SEARCH_PAGE) { CAROUSEL_PAGES }
    val scope = rememberCoroutineScope()
    val sheet = remember(model, pager, scope) { SheetNav(model, pager, scope) }
    SideEffect { sheet.onShown = onShown }
    LaunchedEffect(sheet) { snapshotFlow { sheet.top is SheetPage.Airport }.drop(1).collect { if (!it) airports.close() } }
    val profile by ProfileOpen.at.collectAsStateWithLifecycle()
    LaunchedEffect(profile) {
        val at = profile ?: return@LaunchedEffect
        sheet.open(SheetPage.of(at))
        ProfileOpen.close()
    }
    // The emergency assistant asked for from anywhere (EmergencyOpen: flying
    // mode, the pilot's words, a checklist, You, a link) is a card on the
    // stack, over the card it was asked from so Back comes back to it; it
    // stays open, for the map's glide ring and line, while its card is on
    // the stack, and closes when its card is taken off.
    val emergency by EmergencyOpen.from.collectAsStateWithLifecycle()
    LaunchedEffect(emergency) { if (emergency != null && SheetPage.Emergency !in sheet.stack) sheet.open(SheetPage.Emergency) }
    LaunchedEffect(sheet) {
        var was = false
        snapshotFlow { SheetPage.Emergency in sheet.stack }.collect { on ->
            // Its card brought back with the stack (the process restarted):
            // the assistant open again with it.
            if (on && EmergencyOpen.from.value == null) EmergencyOpen.open(EmergencyOpen.From.LINK)
            if (!on && was) EmergencyOpen.close()
            was = on
        }
    }
    return sheet
}

/** The carousel's pages, in their order (the owner, 2026-11-11). */
internal const val SEARCH_PAGE = 0
internal const val PLAN_PAGE = 1
internal const val CAROUSEL_PAGES = 2
