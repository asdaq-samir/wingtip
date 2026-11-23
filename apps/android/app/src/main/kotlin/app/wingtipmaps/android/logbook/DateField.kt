package app.wingtipmaps.android.logbook

import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.rememberShownText
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * A logbook line's date (YYYY-MM-DD, as the gateway keeps `flownOn`),
 * picked on Material's date picker in its own dialog rather than typed:
 * the calendar, or the picker's own typed entry through its mode toggle.
 * The field shows the date and is not typed into; its calendar button
 * opens the picker on the date shown, or today where none reads.
 */
@Composable
fun DateField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier, supporting: String? = null) {
    var picking by rememberSaveable { mutableStateOf(false) }
    val pick = stringResource(R.string.logbook_pick_date)
    OutlinedTextField(
        state = rememberShownText(value), modifier = modifier, readOnly = true,
        label = { Text(label) }, lineLimits = TextFieldLineLimits.SingleLine,
        supportingText = supporting?.let { { Text(it) } },
        trailingIcon = { IconButton(onClick = { picking = true }) { Icon(Icons.Filled.DateRange, contentDescription = pick) } },
    )
    if (!picking) return
    val state = rememberDatePickerState(initialSelectedDateMillis = LogbookDate.millis(value))
    DatePickerDialog(
        onDismissRequest = { picking = false },
        confirmButton = {
            TextButton(
                onClick = {
                    state.selectedDateMillis?.let { onChange(LogbookDate.iso(it)) }
                    picking = false
                },
                enabled = state.selectedDateMillis != null,
            ) { Text(stringResource(R.string.ok)) }
        },
        dismissButton = { TextButton(onClick = { picking = false }) { Text(stringResource(R.string.cancel)) } },
    ) { DatePicker(state = state) }
}

/** Between the logbook's ISO date and the picker's day, which Material's
 *  DatePickerState holds as the UTC midnight that starts it. Pure, so the
 *  JVM tests hold it. */
object LogbookDate {
    /** The picker's day for a date kept or drawn; null where it does not read. */
    fun millis(iso: String): Long? =
        runCatching { LocalDate.parse(iso.trim()).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() }.getOrNull()

    /** The date the picker's day is, as the logbook keeps it. */
    fun iso(millis: Long): String = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()
}
