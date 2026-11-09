package app.wingtipmaps.android.design

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipMotion
import app.wingtipmaps.android.design.generated.WingtipSpace

/** How faint a row gets at the bottom of its breath. */
private const val FAINT = 0.45f

/**
 * Rows standing in for a list or a card while its data loads, the app's
 * one skeleton: each a title's bar over a line's, in the theme's muted
 * fill (the tokens' `muted`, Material's surfaceVariant), breathing once
 * every motion.skeleton-pulse; still under Reduce Motion. TalkBack reads
 * it as one "Loading".
 */
@Composable
fun Skeleton(modifier: Modifier = Modifier, rows: Int = 3) {
    val reduce = rememberReduceMotion()
    val pulse = if (reduce) null else rememberInfiniteTransition(label = "skeleton").animateFloat(
        initialValue = 1f,
        targetValue = FAINT,
        animationSpec = infiniteRepeatable(tween(WingtipMotion.SKELETON_PULSE_MS / 2, easing = LinearEasing), RepeatMode.Reverse),
        label = "skeletonPulse",
    )
    val fill = MaterialTheme.colorScheme.surfaceVariant
    val shape = MaterialTheme.shapes.small
    val loading = stringResource(R.string.loading)
    Column(
        modifier.fillMaxWidth().graphicsLayer { alpha = pulse?.value ?: 1f }.clearAndSetSemantics { contentDescription = loading },
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md),
    ) {
        repeat(rows) {
            Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                Box(Modifier.fillMaxWidth(0.55f).height(16.dp).background(fill, shape))
                Box(Modifier.fillMaxWidth(0.85f).height(12.dp).background(fill, shape))
            }
        }
    }
}
