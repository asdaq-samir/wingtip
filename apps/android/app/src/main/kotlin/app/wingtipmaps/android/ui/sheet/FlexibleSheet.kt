package app.wingtipmaps.android.ui.sheet

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeFlexibleTopAppBar
import androidx.compose.material3.MediumFlexibleTopAppBar
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * A page over the map at the whole height, Android's way: Material's
 * modal sheet (CardSheet) holding a Scaffold whose top bar is Material 3
 * Expressive's flexible app bar -- large for a page about one answer (the
 * Brief), medium for the rest -- with the title, a subtitle, the actions
 * and Close at the end (decision 0015: no back arrow at the start), which
 * collapses to a small bar as the page scrolls. A primary action that
 * must sit in the same place every time goes in `bottomBar`, at the
 * thumb. Back and a swipe down close it, as the modal sheet previews.
 *
 * @param content the page, given the Scaffold's padding; a scrolling
 *   child drives the bar's collapse through the Scaffold's nested scroll.
 */
@Composable
fun FlexibleSheet(
    title: String,
    onClose: () -> Unit,
    subtitle: String? = null,
    large: Boolean = false,
    actions: @Composable RowScope.() -> Unit = {},
    bottomBar: @Composable () -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    CardSheet(onClose = onClose) {
        val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
        val titleText: @Composable () -> Unit = { Text(title, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        val subtitleText: (@Composable () -> Unit)? = subtitle?.let { s -> { Text(s, maxLines = 1, overflow = TextOverflow.Ellipsis) } }
        val barActions: @Composable RowScope.() -> Unit = {
            actions()
            IconButton(onClick = onClose) { Icon(WingtipIcons.close, contentDescription = stringResource(R.string.close)) }
        }
        // The sheet already clears the system bars, so the bar adds none,
        // and it stays the sheet's own colour until the page scrolls under.
        val colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
        Scaffold(
            modifier = Modifier.fillMaxSize().nestedScroll(scroll.nestedScrollConnection),
            containerColor = Color.Transparent,
            contentWindowInsets = WindowInsets(0),
            topBar = {
                if (large) {
                    LargeFlexibleTopAppBar(
                        title = titleText, subtitle = subtitleText, actions = barActions,
                        windowInsets = WindowInsets(0), colors = colors, scrollBehavior = scroll,
                    )
                } else {
                    MediumFlexibleTopAppBar(
                        title = titleText, subtitle = subtitleText, actions = barActions,
                        windowInsets = WindowInsets(0), colors = colors, scrollBehavior = scroll,
                    )
                }
            },
            bottomBar = bottomBar,
            content = content,
        )
    }
}
