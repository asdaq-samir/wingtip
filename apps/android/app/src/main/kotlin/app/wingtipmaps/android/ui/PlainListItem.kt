package app.wingtipmaps.android.ui

import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * A list row on the card's own surface: Material's ListItem with its
 * container clear, so the sheet shows through as it does behind every
 * other row. `onClick` makes it a tappable row.
 */
@Composable
internal fun PlainListItem(
    supportingContent: @Composable () -> Unit,
    onClick: (() -> Unit)? = null,
    trailingContent: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val colors = ListItemDefaults.colors(containerColor = Color.Transparent)
    if (onClick == null) {
        ListItem(supportingContent = supportingContent, trailingContent = trailingContent, colors = colors, content = content)
    } else {
        ListItem(onClick = onClick, supportingContent = supportingContent, trailingContent = trailingContent, colors = colors, content = content)
    }
}
