package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.adaptive.ExperimentalMaterial3AdaptiveApi
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfoV2
import androidx.compose.material3.adaptive.layout.AnimatedPane
import androidx.compose.material3.adaptive.layout.ListDetailPaneScaffold
import androidx.compose.material3.adaptive.layout.ListDetailPaneScaffoldDefaults
import androidx.compose.material3.adaptive.layout.ListDetailPaneScaffoldRole
import androidx.compose.material3.adaptive.layout.ThreePaneScaffoldDestinationItem
import androidx.compose.material3.adaptive.layout.calculatePaneScaffoldDirective
import androidx.compose.material3.adaptive.layout.calculateThreePaneScaffoldValue
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.window.core.layout.WindowSizeClass
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.predictiveBack
import app.wingtipmaps.android.design.rememberPredictiveBack

/**
 * The panel on a tablet or an unfolded phone, in place of the docked sheet
 * (the owner, 2026-11-09): Material's adaptive list-detail scaffold at the
 * screen's start beside the map -- the one search and what it lists, or
 * the plan, in the list pane, and the field's or airplane's card picked in
 * the detail pane. A window wide enough for two panes shows both side by
 * side; one pane wide shows the card in the list's place. Back closes the
 * card, the system's predictive back drawing it away.
 *
 * @param card the card open, or none.
 */
@OptIn(ExperimentalMaterial3AdaptiveApi::class, ExperimentalMaterial3Api::class)
@Composable
fun WidePanes(card: SheetPage?, list: @Composable () -> Unit, detail: @Composable (SheetPage) -> Unit, onBack: () -> Unit, map: @Composable () -> Unit) {
    val directive = calculatePaneScaffoldDirective(currentWindowAdaptiveInfoV2())
    val role = if (card != null) ListDetailPaneScaffoldRole.Detail else ListDetailPaneScaffoldRole.List
    val value = calculateThreePaneScaffoldValue(
        directive.maxHorizontalPartitions,
        ListDetailPaneScaffoldDefaults.adaptStrategies(),
        ThreePaneScaffoldDestinationItem<Nothing>(role),
    )
    val panes = directive.maxHorizontalPartitions.coerceIn(1, 2)
    val width = WingtipSize.Panel * panes + directive.horizontalPartitionSpacerSize * (panes - 1)
    val back = rememberPredictiveBack(enabled = card != null, onBack = onBack)
    Row(Modifier.fillMaxSize()) {
        Surface(
            Modifier.width(width).fillMaxHeight(),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = BottomSheetDefaults.Elevation,
        ) {
            ListDetailPaneScaffold(
                directive = directive,
                value = value,
                listPane = { AnimatedPane { list() } },
                detailPane = { AnimatedPane(Modifier.predictiveBack(back)) { card?.let { detail(it) } } },
                modifier = Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Start + WindowInsetsSides.Vertical)),
            )
        }
        Box(Modifier.weight(1f).fillMaxHeight()) { map() }
    }
}

/** Whether the window is wide enough for the panes rather than the sheet:
 *  Material's medium width and up (600 dp), a tablet or an unfolded phone. */
@Composable
fun isWide(): Boolean = currentWindowAdaptiveInfoV2().windowSizeClass.isWidthAtLeastBreakpoint(WindowSizeClass.WIDTH_DP_MEDIUM_LOWER_BOUND)
