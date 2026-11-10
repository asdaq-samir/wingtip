package app.wingtipmaps.android.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import app.wingtipmaps.android.R
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen

/**
 * A row in a list that opens one of the app's screens by its name
 * (ScreenRequests, the one way in OpenScreen keeps), so a screen deeper
 * than two taps gets a way in from a list that already holds its kind
 * (docs/navigation.md): Setup's Checklists, Coach and Emergency Assistant,
 * the Airplane page's Emergency Assistant. Its title in the tint, as a
 * thing tapped is; the line under it says what is there.
 */
@Composable
internal fun ScreenRow(screen: Screen, @StringRes title: Int, @StringRes line: Int) {
    ListItem(
        supportingContent = { Text(stringResource(line), color = MaterialTheme.colorScheme.onSurfaceVariant) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button) { ScreenRequests.ask(screen) },
        content = { Text(stringResource(title), color = MaterialTheme.colorScheme.primary) },
    )
}

/** The emergency assistant, on the ground too: two taps from the map
 *  (the Airplane page's checklists), where it was three. */
@Composable
internal fun EmergencyAssistantRow() = ScreenRow(Screen.EMERGENCY, R.string.emergency_assistant, R.string.emergency_assistant_ground_line)
