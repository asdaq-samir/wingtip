package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
    trailing: @Composable (() -> Unit)? = null,
    onClick: () -> Unit,
) {
    SegmentedListItem(
        onClick = onClick,
        shapes = ListItemDefaults.segmentedShapes(index = index, count = count),
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
