package app.wingtipmaps.android.design

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.pullToRefresh
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import app.wingtipmaps.android.design.generated.WingtipSize

/**
 * Pull to refresh over live data (the airport card's weather, the Brief,
 * traffic): Material 3's PullToRefreshBox put together from its own two
 * parts, the pullToRefresh modifier and its indicator, so the distance
 * pulled before it refreshes is the tokens' size.refresh-pull (64, as
 * iOS's refresh control) where the box's own is 80 dp. Its content must
 * scroll for the pull to reach it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RefreshBox(
    refreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) {
    val state = rememberPullToRefreshState()
    Box(
        modifier.pullToRefresh(
            isRefreshing = refreshing, state = state, enabled = enabled,
            threshold = WingtipSize.RefreshPull, onRefresh = onRefresh,
        ),
    ) {
        content()
        if (enabled) {
            PullToRefreshDefaults.Indicator(
                state = state, isRefreshing = refreshing,
                modifier = Modifier.align(Alignment.TopCenter), maxDistance = WingtipSize.RefreshPull,
            )
        }
    }
}
