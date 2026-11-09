package app.wingtipmaps.android.emergency

import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.SectionTitle

/**
 * With no airplane picked, the emergency's general guidance in place of
 * an airplane's checklist (the owner, 2026-11-09): the engine's
 * emergency_guidance -- fly the airplane, a field within reach, 7700,
 * MAYDAY on the frequency in use or 121.5, each with its AIM paragraph or
 * the Airplane Flying Handbook's chapter -- and the airplane picker, so a
 * pilot who picks one gets its glide and checklist. No airplane's figure
 * is shown.
 */
@Composable
internal fun NoAirplaneGuidance(state: EmergencyModel.State, picker: @Composable () -> Unit) {
    SectionTitle(stringResource(R.string.pick_an_airplane))
    Text(stringResource(R.string.pick_an_airplane_line), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    picker()
    SectionTitle(stringResource(R.string.emergency_guidance))
    state.guidance.forEach { item ->
        ListItem(
            headlineContent = { Text(item.title) },
            supportingContent = { Text("${item.detail} (${item.source})") },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        )
    }
}
