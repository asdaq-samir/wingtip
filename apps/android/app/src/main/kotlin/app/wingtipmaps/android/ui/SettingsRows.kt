package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics

/**
 * A group of settings rows, Material 3 Expressive's segmented list: the
 * rows of one group sit at the list's small gap, the first rounded at the
 * top and the last at the foot (ListItemDefaults.segmentedShapes), the
 * way Android's own settings group their rows. Each row takes its place
 * in the group (`index` of `count`) for its shape.
 */
@Composable
fun SettingsGroup(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ListItemDefaults.SegmentedGap), content = content)
}

/**
 * A setting on or off: a segmented row with the stock switch at its end,
 * the whole row the toggle (a row is 56 dp, over Material's 48 dp
 * target), Material's own checkable segmented list item. The switch's
 * own ToggleOn and ToggleOff haptics are the stock ones.
 */
@Composable
fun SwitchSettingRow(title: String, on: Boolean, index: Int, count: Int, onChange: (Boolean) -> Unit) {
    SegmentedListItem(
        checked = on,
        onCheckedChange = onChange,
        shapes = ListItemDefaults.segmentedShapes(index = index, count = count),
        modifier = Modifier.fillMaxWidth(),
        trailingContent = { Switch(checked = on, onCheckedChange = null) },
        content = { Text(title) },
    )
}

/** A row that opens or does something: its name, and a line under it. */
@Composable
fun ActionSettingRow(
    title: String,
    index: Int,
    count: Int,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    enabled: Boolean = true,
    leading: @Composable (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
    onClick: () -> Unit,
) {
    SegmentedListItem(
        onClick = onClick,
        shapes = ListItemDefaults.segmentedShapes(index = index, count = count),
        enabled = enabled,
        leadingContent = leading,
        modifier = modifier.fillMaxWidth().semantics { role = Role.Button },
        supportingContent = if (supporting != null) {
            { Text(supporting, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            null
        },
        trailingContent = trailing,
        content = { Text(title) },
    )
}

/** A figure shown, not changed: its name, and its value at the end. */
@Composable
fun ValueSettingRow(title: String, value: String, index: Int, count: Int) {
    SegmentedListItem(
        shapes = ListItemDefaults.segmentedShapes(index = index, count = count),
        modifier = Modifier.fillMaxWidth(),
        trailingContent = { Text(value, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) },
        content = { Text(title) },
    )
}

/**
 * A setting of a few choices as a row of the group, Material's own: the
 * whole row the target, its name and the value at its end, a tap opening
 * the stock menu under it (the sheet audit's B-1 and B-2, 2026-11-10: a
 * lone "Off" text button read only "Off, button"). TalkBack reads the
 * row's name and value as one button.
 */
@Composable
fun MenuSettingRow(title: String, value: String, choices: List<Pair<String, () -> Unit>>, index: Int, count: Int) {
    var open by remember { mutableStateOf(false) }
    Box {
        SegmentedListItem(
            onClick = { open = true },
            shapes = ListItemDefaults.segmentedShapes(index = index, count = count),
            modifier = Modifier.fillMaxWidth().semantics { role = Role.DropdownList },
            trailingContent = { Text(value, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) },
            content = { Text(title) },
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for ((label, pick) in choices) {
                DropdownMenuItem(
                    text = { Text(label) },
                    trailingIcon = if (label == value) {
                        { Icon(Icons.Filled.Check, contentDescription = null) }
                    } else {
                        null
                    },
                    onClick = {
                        open = false
                        pick()
                    },
                )
            }
        }
    }
}
