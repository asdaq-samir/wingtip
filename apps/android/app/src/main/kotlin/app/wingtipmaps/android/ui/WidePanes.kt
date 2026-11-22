package app.wingtipmaps.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.adaptive.ExperimentalMaterial3AdaptiveApi
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfoV2
import androidx.compose.material3.adaptive.layout.calculatePaneScaffoldDirective
import androidx.compose.material3.adaptive.navigation.BackNavigationBehavior
import androidx.compose.material3.adaptive.navigation3.rememberListDetailSceneStrategy
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import androidx.navigation3.scene.SceneStrategy
import androidx.window.core.layout.WindowSizeClass
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.route.RouteToolbar

/**
 * The panel on a tablet, an unfolded phone or a desktop window, in place
 * of the docked sheet (the owner, 2026-11-09), laid out by the window's
 * width as PaneRoom says:
 *
 * - medium: Material's list-detail scene for Navigation 3 in one panel at
 *   the start, the one search and what it lists, or the plan, with a
 *   card in its place;
 * - expanded and wider: the panel at the start, the map across the middle
 *   and a thing's card in a supporting pane at the end, as the iPad's
 *   inspector and Material's supporting-pane layout hold it, the panel
 *   giving way while a card is up where the three do not fit.
 *
 * The sheet's one back stack (MapViewModel) keeps the card in every
 * layout and across a resize, a rotation or a fold, and Back closes the
 * stack's top in whichever pane it is: that pane's own NavDisplay and its
 * predictive back, or for the one card in the supporting pane the stock
 * BackHandler, as the pane's NavDisplay has nothing under it to go back to.
 *
 * @param pages the sheet's NavDisplay (SheetPagesHost) for the part of the
 *   stack given, with its modifier, whether it takes Back, and the
 *   list-detail scene or none.
 * @param searchAsks the one search's asks (SearchControl.asked): one over
 *   a card brings the panel back where it gave way.
 */
@Composable
fun WidePanes(
    sheet: SheetNav,
    searchAsks: Int,
    pages: @Composable (Modifier, List<SheetPage>, Boolean, SceneStrategy<SheetPage>?) -> Unit,
    map: @Composable () -> Unit,
) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        if (PaneRoom.supportingPane(maxWidth)) {
            SupportingPanes(sheet, searchAsks, maxWidth, pages, map)
        } else {
            OnePanel(sheet, pages, map)
        }
    }
}

/** Medium width: the list-detail scene in one panel at the start. */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
private fun OnePanel(sheet: SheetNav, pages: @Composable (Modifier, List<SheetPage>, Boolean, SceneStrategy<SheetPage>?) -> Unit, map: @Composable () -> Unit) {
    // One pane whatever the window: the panel is this layout's width, not
    // the window's (a wider window has the supporting pane instead).
    val directive = calculatePaneScaffoldDirective(currentWindowAdaptiveInfoV2()).copy(maxHorizontalPartitions = 1)
    // Back closes the card, not every pane change before it.
    val scenes = rememberListDetailSceneStrategy<SheetPage>(backNavigationBehavior = BackNavigationBehavior.PopUntilContentChange, directive = directive)
    Row(Modifier.fillMaxSize()) {
        PanelSurface(Modifier.width(WingtipSize.Panel).testTag(PANEL_TAG), Edge.START) { modifier ->
            pages(modifier, sheet.stack, true, scenes)
        }
        Box(Modifier.weight(1f).fillMaxHeight()) { map() }
    }
}

/** Expanded and wider: the panel, the map, and a thing's card beside it. */
@Composable
private fun SupportingPanes(
    sheet: SheetNav,
    searchAsks: Int,
    width: Dp,
    pages: @Composable (Modifier, List<SheetPage>, Boolean, SceneStrategy<SheetPage>?) -> Unit,
    map: @Composable () -> Unit,
) {
    val top = sheet.stack.last()
    val panelStack = PaneRoom.panelStack(sheet.stack)
    val cardStack = PaneRoom.cardStack(sheet.stack)
    // The card the search was asked over, where the panel had given way.
    var askedOver by remember { mutableStateOf<SheetPage?>(null) }
    var asksSeen by remember { mutableIntStateOf(searchAsks) }
    LaunchedEffect(searchAsks) {
        if (searchAsks != asksSeen) askedOver = top
        asksSeen = searchAsks
    }
    // The cards last shown, kept while the pane closes, as a NavDisplay
    // cannot draw an empty stack.
    val lastCards = remember { mutableStateOf(cardStack) }
    val shownCards = cardStack.ifEmpty { lastCards.value }
    SideEffect { if (cardStack.isNotEmpty()) lastCards.value = cardStack }
    // The one card left in the pane: Back closes it, as NavDisplay goes
    // back only to a page under the one shown.
    BackHandler(enabled = top.inspects && cardStack.size == 1) { sheet.back() }
    // The flight's figures go to the map's foot here (MapFigures), out of
    // the plan's foot in the panel.
    CompositionLocalProvider(LocalFiguresOnMap provides true) { Row(Modifier.fillMaxSize()) {
        AnimatedVisibility(PaneRoom.panelShown(top, width, askedOver), enter = expandHorizontally(), exit = shrinkHorizontally()) {
            PanelSurface(Modifier.width(WingtipSize.Panel).testTag(PANEL_TAG), Edge.START) { modifier ->
                pages(modifier, panelStack, !top.inspects, null)
            }
        }
        Box(Modifier.weight(1f).fillMaxHeight()) { map() }
        AnimatedVisibility(cardStack.isNotEmpty(), enter = expandHorizontally(), exit = shrinkHorizontally()) {
            PanelSurface(Modifier.width(WingtipSize.Panel).testTag(CARD_PANE_TAG), Edge.END) { modifier ->
                if (shownCards.isNotEmpty()) pages(modifier, shownCards, top.inspects, null)
            }
        }
    } }
}

private enum class Edge { START, END }

/** A pane's ground, the sheet's surface and its tonal elevation, its
 *  content clear of the bars and the cut-out on its own side. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PanelSurface(modifier: Modifier, edge: Edge, content: @Composable (Modifier) -> Unit) {
    Surface(modifier.fillMaxHeight(), color = MaterialTheme.colorScheme.surface, tonalElevation = BottomSheetDefaults.Elevation) {
        val side = if (edge == Edge.START) WindowInsetsSides.Start else WindowInsetsSides.End
        content(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing.only(side + WindowInsetsSides.Vertical)))
    }
}

/** The panel's and the supporting pane's test tags (WidePanesTest). */
internal const val PANEL_TAG = "wide-panel"
internal const val CARD_PANE_TAG = "wide-card-pane"

/** Whether the window is wide enough for the panes rather than the sheet:
 *  Material's medium width and up (600 dp), a tablet or an unfolded phone. */
@Composable
fun isWide(): Boolean = currentWindowAdaptiveInfoV2().windowSizeClass.isWidthAtLeastBreakpoint(WindowSizeClass.WIDTH_DP_MEDIUM_LOWER_BOUND)

/**
 * A wide window's map: the route being worked on with its floating
 * toolbar over the map and an edit's Snackbar over that, and on an
 * expanded window the flight's figures at its foot, glance-sized
 * (MapFigures, LocalFiguresOnMap).
 */
@Composable
internal fun WideMap(pages: SheetNav, plan: Plan, state: Plan.State, snackbars: SnackbarHostState, onAddPoint: () -> Unit, map: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize()) {
        map()
        val editing = pages.planShown && state.routed
        val figures = LocalFiguresOnMap.current && state.routed
        Column(Modifier.align(Alignment.BottomCenter), horizontalAlignment = Alignment.CenterHorizontally) {
            SnackbarHost(snackbars, if (editing || figures) Modifier else Modifier.navigationBarsPadding())
            if (editing) RouteToolbar(plan, onAddPoint = onAddPoint)
            if (figures) MapFigures(state)
        }
    }
}
