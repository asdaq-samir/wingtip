package app.wingtipmaps.android.airplane

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.LocalInk
import app.wingtipmaps.android.ui.SectionTitle

/**
 * The airplane's endurance on its profile, under its figures, as the
 * iPhone's EnduranceSection has it: To Dry Tanks, then the time left
 * after each reserve with the reserve under it (Endurance, the engine's).
 * A reserve the tanks cannot hold is in the caution ink with its warning,
 * never hidden. Without the airplane's own usable fuel or burn it asks
 * for the one missing, a tap opening it to edit (`onEdit`), never a
 * typical airplane's figure.
 */
@Composable
fun EnduranceSection(airplane: AirplaneNow, onEdit: (FigureKey) -> Unit) {
    val endurance = remember(airplane) { Endurance.of(airplane) }
    SectionTitle(stringResource(R.string.endurance))
    if (endurance == null) {
        val missing = listOf(FigureKey.USABLE, FigureKey.BURN).firstOrNull { airplane.value(it) == null } ?: FigureKey.USABLE
        val name = airplane.name ?: stringResource(R.string.this_airplane)
        ListItem(
            onClick = { onEdit(missing) },
            supportingContent = { Text(stringResource(R.string.endurance_needs), color = MaterialTheme.colorScheme.onSurfaceVariant) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            modifier = Modifier.fillMaxWidth(),
            content = { Text(stringResource(missing.question, name), color = MaterialTheme.colorScheme.primary) },
        )
        return
    }
    EnduranceRow(stringResource(R.string.endurance_dry_tanks), endurance.minutes, note = null, below = false)
    endurance.after.forEach { a ->
        val reserve = Format.duration(a.reserveMin)
        val note = if (a.below) stringResource(R.string.endurance_reserve_below, reserve) else stringResource(R.string.endurance_reserve, reserve)
        EnduranceRow(stringResource(a.reserve.title), a.minutes, note, a.below)
    }
}

@Composable
private fun EnduranceRow(title: String, minutes: Double, note: String?, below: Boolean) {
    val value = Format.duration(minutes)
    val tint = if (below) LocalInk.current.cautionInk else MaterialTheme.colorScheme.onSurface
    ListItem(
        supportingContent = note?.let { { Text(it, color = if (below) tint else MaterialTheme.colorScheme.onSurfaceVariant) } },
        trailingContent = {
            Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xs), verticalAlignment = Alignment.CenterVertically) {
                if (below) Icon(Icons.Filled.Warning, contentDescription = null, tint = tint)
                Text(value, style = MaterialTheme.typography.bodyLarge, color = tint)
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = listOfNotNull("$title, $value", note).joinToString(", ") },
        content = { Text(title) },
    )
}
