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
import androidx.compose.material3.adaptive.layout.calculatePaneScaffoldDirective
import androidx.compose.material3.adaptive.navigation.BackNavigationBehavior
import androidx.compose.material3.adaptive.navigation3.rememberListDetailSceneStrategy
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation3.scene.SceneStrategy
import androidx.window.core.layout.WindowSizeClass
import app.wingtipmaps.android.design.generated.WingtipSize

/**
 * The panel on a tablet or an unfolded phone, in place of the docked sheet
 * (the owner, 2026-11-09): Material's list-detail scene for Navigation 3
 * at the screen's start beside the map -- the one search and what it
 * lists, or the plan, in the list pane, and the field's or airplane's card
 * picked in the detail pane. A window wide enough for two panes shows both
 * side by side; one pane wide shows the card in the list's place. The
 * sheet's one back stack (MapViewModel) keeps the card in either layout,
 * and the scene's own predictive back closes it.
 *
 * @param pages the sheet's NavDisplay (SheetPagesHost), given its modifier
 *   and the list-detail scene to lay its stack out in.
 */
@OptIn(ExperimentalMaterial3AdaptiveApi::class, ExperimentalMaterial3Api::class)
@Composable
fun WidePanes(pages: @Composable (Modifier, SceneStrategy<SheetPage>) -> Unit, map: @Composable () -> Unit) {
    val directive = calculatePaneScaffoldDirective(currentWindowAdaptiveInfoV2())
    // Back closes the card, not every pane change before it.
    val scenes = rememberListDetailSceneStrategy<SheetPage>(backNavigationBehavior = BackNavigationBehavior.PopUntilContentChange, directive = directive)
    val panes = directive.maxHorizontalPartitions.coerceIn(1, 2)
    val width = WingtipSize.Panel * panes + directive.horizontalPartitionSpacerSize * (panes - 1)
    Row(Modifier.fillMaxSize()) {
        Surface(
            Modifier.width(width).fillMaxHeight(),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = BottomSheetDefaults.Elevation,
        ) {
            pages(Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Start + WindowInsetsSides.Vertical)), scenes)
        }
        Box(Modifier.weight(1f).fillMaxHeight()) { map() }
    }
}

/** Whether the window is wide enough for the panes rather than the sheet:
 *  Material's medium width and up (600 dp), a tablet or an unfolded phone. */
@Composable
fun isWide(): Boolean = currentWindowAdaptiveInfoV2().windowSizeClass.isWidthAtLeastBreakpoint(WindowSizeClass.WIDTH_DP_MEDIUM_LOWER_BOUND)
