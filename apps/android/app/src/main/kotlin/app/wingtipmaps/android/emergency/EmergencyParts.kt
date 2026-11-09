package app.wingtipmaps.android.emergency

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.core.net.toUri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.SectionTitle

/**
 * The airplane's own emergency checklist (the pilot's copy of its
 * handbook's Section 3, kept on the phone), opened at the emergency asked
 * -- "Engine failure in flight" by default -- with a menu of its other
 * sections and each item ticked as it is done. The app writes none: with
 * no list kept it says so.
 */
@Composable
internal fun EmergencyChecklist(state: EmergencyModel.State, onSection: (Int) -> Unit, onTick: (String) -> Unit) {
    val section = state.section
    val shown = section?.let { state.sections.getOrNull(it) }
    if (section == null || shown == null) {
        SectionTitle(stringResource(R.string.checklists))
        ListItem(
            headlineContent = { Text(stringResource(R.string.emergency_no_checklist, state.airplaneName ?: stringResource(R.string.this_airplane))) },
            supportingContent = { Text(stringResource(R.string.emergency_no_checklist_line)) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        )
        return
    }
    var menu by remember { mutableStateOf(false) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) { SectionTitle(shown.title) }
        Box {
            TextButton(onClick = { menu = true }) { Text(stringResource(R.string.emergency_other)) }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                state.sections.forEachIndexed { i, s ->
                    DropdownMenuItem(text = { Text(s.title) }, onClick = { onSection(i); menu = false })
                }
            }
        }
    }
    shown.items.forEachIndexed { i, item ->
        val key = "$section:$i"
        val done = key in state.ticked
        ListItem(
            leadingContent = { Checkbox(checked = done, onCheckedChange = null) },
            headlineContent = { Text(item.challenge, color = if (done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface) },
            trailingContent = item.response?.let { r -> { Text(r, fontWeight = FontWeight.SemiBold) } },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            modifier = Modifier.toggleable(value = done, role = Role.Checkbox) { onTick(key) },
        )
    }
}

/**
 * What to do on the radio and the transponder, the engine's (mayday_call):
 * squawk 7700 (AIM 6-2-2, an assigned code kept while talking to ATC),
 * the frequencies to try -- the nearest approach and tower the FAA lists,
 * 121.5 (AIM 6-3-1(d)) -- and the MAYDAY in AIM 6-3-2(a)(3)'s order, what
 * the app does not know left in brackets to say, with the two the pilot
 * can tell it here. The phones: the field picked's own as the FAA lists
 * it, and 911; none invented.
 */
@Composable
internal fun ActionsList(state: EmergencyModel.State, onSouls: (String) -> Unit, onFuel: (String) -> Unit) {
    val context = LocalContext.current
    val mayday = state.mayday
    if (mayday != null) {
        SectionTitle(stringResource(R.string.emergency_radio))
        Plain(stringResource(R.string.emergency_squawk, mayday.squawk), mayday.squawkWords, bold = true)
        mayday.channels.forEach { c ->
            ListItem(
                headlineContent = { Text(c.label) },
                supportingContent = { Text(c.why) },
                trailingContent = c.mhz?.let { mhz -> { Text(Format.frequency(mhz), fontWeight = FontWeight.SemiBold) } },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            )
        }
        SectionTitle(stringResource(R.string.emergency_mayday))
        Column(Modifier.padding(vertical = WingtipSpace.Sm), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
            mayday.lines.forEach { line ->
                Text(
                    line, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium,
                    color = if (line.startsWith("[")) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        OutlinedTextField(
            value = state.souls, onValueChange = onSouls, modifier = Modifier.weight(1f), singleLine = true,
            label = { Text(stringResource(R.string.emergency_souls)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )
        OutlinedTextField(
            value = state.fuelMin, onValueChange = onFuel, modifier = Modifier.weight(1f), singleLine = true,
            label = { Text(stringResource(R.string.emergency_fuel)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )
    }
    SectionTitle(stringResource(R.string.emergency_phone))
    val picked = state.picked
    val phone = state.phone
    if (phone != null && picked != null) {
        Plain(stringResource(R.string.emergency_call_field, picked.ident), stringResource(R.string.emergency_call_field_line), tint = true) {
            context.startActivity(Intent(Intent.ACTION_DIAL, "tel:$phone".toUri()))
        }
    }
    Plain(stringResource(R.string.emergency_call_911), null, tint = true) {
        context.startActivity(Intent(Intent.ACTION_DIAL, "tel:911".toUri()))
    }
}

@Composable
private fun Plain(title: String, line: String?, bold: Boolean = false, tint: Boolean = false, onClick: (() -> Unit)? = null) {
    ListItem(
        headlineContent = { Text(title, fontWeight = if (bold) FontWeight.SemiBold else null, color = if (tint) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface) },
        supportingContent = line?.let { { Text(it) } },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = if (onClick != null) Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick) else Modifier.fillMaxWidth(),
    )
}
