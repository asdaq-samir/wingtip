package app.wingtipmaps.android.airplane

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.flight.GlideRing

/**
 * The glide ring's switch, among the map's settings (the owner,
 * 2026-11-09): off unless the pilot keeps it on ("glide_ring"), the ring
 * coming on by itself in an emergency regardless. Unavailable, with why,
 * with no airplane or one without its own glide ratio; for the latter,
 * Edit opens its profile at the glide ratio.
 */
@Composable
fun GlideRingRow(plan: Plan) {
    val context = LocalContext.current
    val kept by GlideRing.flow(context).collectAsStateWithLifecycle()
    val airplane = rememberAirplaneNow(plan)
    val why = GlideRing.unavailable(airplane.profile != null, airplane.glideRatio)
    val on = kept == true
    Column {
        ListItem(
            supportingContent = {
                val line = when (why) {
                    GlideRing.Unavailable.NO_AIRPLANE -> stringResource(R.string.glide_ring_no_airplane)
                    GlideRing.Unavailable.NO_GLIDE -> stringResource(R.string.glide_ring_no_glide, airplane.name ?: stringResource(R.string.this_airplane))
                    null -> stringResource(R.string.glide_ring_line)
                }
                Text(line, color = MaterialTheme.colorScheme.onSurfaceVariant)
            },
            trailingContent = { Switch(checked = on && why == null, onCheckedChange = null, enabled = why == null) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            modifier = Modifier.fillMaxWidth().toggleable(value = on, enabled = why == null, role = Role.Switch) { GlideRing.set(context, it) },
            content = { Text(stringResource(R.string.glide_ring)) },
        )
        if (why == GlideRing.Unavailable.NO_GLIDE) {
            val name = airplane.name ?: stringResource(R.string.this_airplane)
            TextButton(onClick = { ProfileOpen.open(airplane.tail, FigureKey.GLIDE.key) }) { Text(stringResource(R.string.ask_edit, name)) }
        }
    }
}
