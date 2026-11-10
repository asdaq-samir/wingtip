package app.wingtipmaps.android.map

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace

/**
 * The map's area while the chart loads: Material's own loading indicator
 * (design/Loading) in the middle of what the sheet leaves ([bottomInset]),
 * where the map opens on the pilot's last position, over the screen's
 * background until the map is first shown ([shown] false), then faded out
 * with the map coming in under it, so chart and overlays appear as one
 * thing. The Wingtip mark stays on the launch's splash screen alone (the
 * owner, 2026-11-10: stock components in place of the hand-drawn turning
 * mark). Where the chart could not be fetched at all (the first launch
 * with no connection), the indicator gives way to why, where the map
 * would be ([problem]).
 */
@Composable
fun MapLoading(shown: Boolean, bottomInset: Dp, modifier: Modifier = Modifier, problem: String? = null) {
    AnimatedVisibility(visible = shown, enter = EnterTransition.None, exit = fadeOut(tween(REVEAL_FADE_MS)), modifier = modifier) {
        Box(
            Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(bottom = bottomInset),
            contentAlignment = Alignment.Center,
        ) {
            if (problem == null) {
                Loading()
            } else {
                Text(
                    problem,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = WingtipSpace.Xxl),
                )
            }
        }
    }
}

/** How long the map fades in, the web's REVEAL_FADE_MS. */
const val REVEAL_FADE_MS = 150
