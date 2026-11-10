package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfoV2
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Where a half-folded phone's fold runs across the screen, as its top
 *  and bottom from the window's top; null unless the phone stands in
 *  Material's tabletop posture, its fold level and half open. */
@Composable
fun tabletopFold(): Pair<Dp, Dp>? {
    val posture = currentWindowAdaptiveInfoV2().windowPosture
    if (!posture.isTabletop) return null
    val hinge = posture.hingeList.firstOrNull { !it.isVertical && !it.isFlat } ?: return null
    return with(LocalDensity.current) { hinge.bounds.top.toDp() to hinge.bounds.bottom.toDp() }
}

/**
 * A half-folded phone standing on a table (the owner, 2026-11-09): the
 * map on the upper half, where it is seen, and the panel on the lower,
 * where it is touched, split at the fold so nothing sits across it, as
 * Android's large-screen guidance lays out the tabletop posture. The
 * panel is the phone sheet's content, the search first, laid flat.
 *
 * @param fold the fold's top and bottom (tabletopFold).
 */
@Composable
fun TabletopPanes(fold: Pair<Dp, Dp>, map: @Composable () -> Unit, panel: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxWidth().height(fold.first)) { map() }
        Box(Modifier.fillMaxWidth().height((fold.second - fold.first).coerceAtLeast(0.dp)))
        Surface(Modifier.fillMaxWidth().weight(1f), color = MaterialTheme.colorScheme.surfaceContainerLow) {
            Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal + WindowInsetsSides.Bottom))) {
                panel()
            }
        }
    }
}
