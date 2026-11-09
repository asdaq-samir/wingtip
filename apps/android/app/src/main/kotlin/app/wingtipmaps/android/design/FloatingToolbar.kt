package app.wingtipmaps.android.design

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import app.wingtipmaps.android.design.generated.WingtipSpace

/** The toolbar's padding round its buttons. */
val ToolbarInset = WingtipSpace.Xs

/**
 * Material 3 Expressive's vertical floating toolbar: the map's own
 * buttons in one pill of the theme's high container, raised over the
 * chart as a menu is. The BOM's Material 3 (1.4) has no toolbar of its
 * own, so it is this Surface. Its buttons sit `ToolbarInset` in from its
 * edge, so a caller places it that much further out to keep them where
 * they were.
 */
@Composable
fun VerticalFloatingToolbar(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(
        modifier = modifier,
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        shadowElevation = MenuDefaults.ShadowElevation,
    ) {
        Column(Modifier.padding(ToolbarInset), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm), content = content)
    }
}
