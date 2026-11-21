package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TimePickerDialog
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace

/**
 * A time asked for -- when the flight leaves, when a stop leaves again --
 * as Material's time picker in its own dialog, the hours and the minutes
 * on the platform's clock dial (the web's time button since the owner's
 * ask of 2026-11-21; Android's own picker rather than wheels): Set takes
 * the time, `onNow` (where there is one) goes back to the planner's own.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimeDialog(title: String, hour: Int, minute: Int, onSet: (Int, Int) -> Unit, onDismiss: () -> Unit, onNow: (() -> Unit)? = null) {
    val picker = rememberTimePickerState(initialHour = hour, initialMinute = minute, is24Hour = true)
    TimePickerDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        confirmButton = { TextButton(onClick = { onSet(picker.hour, picker.minute) }) { Text(stringResource(R.string.depart_set)) } },
        dismissButton = {
            Row {
                onNow?.let { now -> TextButton(onClick = now) { Text(stringResource(R.string.depart_now)) } }
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
            }
        },
    ) { TimePicker(state = picker, modifier = Modifier.padding(top = WingtipSpace.Sm)) }
}
