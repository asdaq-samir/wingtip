package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.firstflight.WelcomeSheet
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.search.SearchControl
import app.wingtipmaps.android.ui.sheet.MapSheet
import app.wingtipmaps.android.ui.sheet.MapSheetState
import app.wingtipmaps.android.ui.sheet.halfWindow

/**
 * The phone's layout (neither the strip, the wide panes nor the fold): the
 * map under Material's standard bottom sheet (MapSheet), the sheet's pages
 * in it (`pages`, RootScreen's SheetPagesHost with the search's row as
 * its head), and the map's buttons riding the sheet's top.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PhoneSheetLayout(
    sheet: MapSheetState,
    snackbars: SnackbarHostState,
    nav: SheetNav,
    ownShip: OwnShipControl,
    onAsk: (() -> Unit)?,
    onLayers: () -> Unit,
    onRadio: (() -> Unit)?,
    plan: Plan,
    search: SearchControl,
    map: @Composable (covered: Dp) -> Unit,
    searchRow: @Composable () -> Unit,
    pages: @Composable (Modifier, backEnabled: Boolean, head: @Composable () -> Unit) -> Unit,
) {
    // The search's row as measured, whatever the font scale: the sheet's
    // peek is the handle, this row and the navigation bar.
    var searchRowPx by remember { mutableIntStateOf(0) }
    // Over the navigation bar (edge to edge): its peek is the handle and
    // the search's row as measured, above the bar, so the bar fits at
    // every font scale (the sheet audit's S-1).
    val navigationBar = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val searchHeight = with(LocalDensity.current) { searchRowPx.toDp() }.takeIf { it > 0.dp } ?: WingtipSize.TapTarget
    // At the peek, the first row of the carousel's page in view: the
    // search's, or the plan's bar.
    val firstRow = if (nav.planShown) TopAppBarDefaults.TopAppBarExpandedHeight else searchHeight + WingtipSpace.Sm
    val peek = if (nav.covered) halfWindow() else SheetHandle + firstRow + navigationBar
    // The map's buttons ride the sheet's top at the right, just above
    // the search (the owner, 2026-11-11), the position button nearest it;
    // 3D and the pages' toggle at the left (the owner, 2026-11-13).
    MapSheet(
        state = sheet, peek = peek, snackbars = snackbars, lowerOnBack = !nav.covered,
        onTop = {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                SheetSideButtons(
                    planShown = nav.planShown,
                    onToggle = if (nav.covered) null else ({ if (nav.planShown) nav.closePlan() else nav.toPlanPage() }),
                    modifier = Modifier.padding(start = WingtipSpace.Sm),
                )
                Spacer(Modifier.weight(1f))
                MapButtons(ownShip = ownShip.mode, onOwnShip = ownShip::tap, onAsk = onAsk, onLayers = onLayers, onRadio = onRadio, positionLast = true)
            }
        },
        body = map,
    ) {
        // A card takes the search's place, its name and ← where the
        // search was; Home and the plan carry the search's row.
        // Back closes a card at once; with none it lowers the expanded
        // sheet first (MapSheet), then goes back a page.
        pages(Modifier.weight(1f).padding(bottom = navigationBar), nav.covered || sheet.atPeek) {
            Box(Modifier.onSizeChanged { searchRowPx = it.height }) { searchRow() }
        }
    }
    // The first flight's welcome, once on this phone (WelcomeSheet); its
    // first route brings the FPL up.
    WelcomeSheet(plan, search, ownShip, onPlanned = { ScreenRequests.ask(Screen.FPL) })
}

/** The stock drag handle's height: its 4-dp bar in 22 dp above and below,
 *  Material's 48-dp target (SheetDefaults.DragHandle). */
private val SheetHandle = WingtipSize.TapTarget
