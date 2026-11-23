package app.wingtipmaps.android.ui

import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.material3.VerticalDragHandle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSize

/**
 * The divider between a pane and the map, dragged to give the pane or
 * the map more room (Android's adaptive guidelines, Tier 1 UI_Config's
 * resizable panes; Material 3's pane expansion and its drag handle,
 * VerticalDragHandle, as it comes). `onWiden` is told each step in dp
 * by how much the pane at the divider's start side (`paneAtStart`) or
 * its end side grows, a right-to-left layout's drag mirrored. Its touch
 * area is the 48 dp Material asks however thin the handle is drawn, and
 * TalkBack's actions widen or narrow the pane a step at a time.
 */
@Composable
internal fun PaneDivider(paneAtStart: Boolean, onWiden: (Dp) -> Unit) {
    val density = LocalDensity.current
    val widen by rememberUpdatedState(onWiden)
    // A drag's step toward the layout's end, then as the pane's growth.
    val toEnd = if (LocalLayoutDirection.current == LayoutDirection.Ltr) 1f else -1f
    val sign = if (paneAtStart) toEnd else -toEnd
    val state = rememberDraggableState { px -> widen(with(density) { (px * sign).toDp() }) }
    val said = stringResource(R.string.pane_divider)
    val wider = stringResource(R.string.pane_divider_widen)
    val narrower = stringResource(R.string.pane_divider_narrow)
    Box(
        Modifier.fillMaxHeight().width(WingtipSize.TapTarget).draggable(state, Orientation.Horizontal).semantics {
            contentDescription = said
            customActions = listOf(
                CustomAccessibilityAction(wider) { widen(STEP); true },
                CustomAccessibilityAction(narrower) { widen(-STEP); true },
            )
        },
        contentAlignment = Alignment.Center,
    ) { VerticalDragHandle() }
}

/** TalkBack's step: a quarter of a panel's width. */
private val STEP = 96.dp
