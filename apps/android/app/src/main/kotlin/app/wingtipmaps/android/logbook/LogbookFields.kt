package app.wingtipmaps.android.logbook

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace

/**
 * A logbook line's fields, as the Flight Logged sheet labels them: the
 * date and airplane, the route, the total and night time, the day and
 * night landings, the remarks. One set for an entry edited in its row and
 * for a flight added by hand, so both read the same.
 */
@Composable
fun LogbookFields(form: LogbookForm, onChange: (LogbookForm) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            Field(R.string.flight_logged_date, form.date, Modifier.weight(1f)) { onChange(form.copy(date = it)) }
            Field(R.string.airplane, form.airplane, Modifier.weight(1f), letters = true) { onChange(form.copy(airplane = it)) }
        }
        Field(R.string.flight_logged_route, form.route, Modifier.fillMaxWidth(), letters = true) { onChange(form.copy(route = it)) }
        Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            Field(R.string.flight_logged_total, form.total, Modifier.weight(1f), KeyboardType.Decimal) { onChange(form.copy(total = it)) }
            Field(R.string.flight_logged_night, form.night, Modifier.weight(1f), KeyboardType.Decimal) { onChange(form.copy(night = it)) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            Field(R.string.flight_logged_day, form.dayLandings, Modifier.weight(1f), KeyboardType.Number) { onChange(form.copy(dayLandings = it)) }
            Field(R.string.flight_logged_night_full_stop, form.nightLandings, Modifier.weight(1f), KeyboardType.Number) {
                onChange(form.copy(nightLandings = it))
            }
        }
        Field(R.string.logbook_remarks, form.remarks, Modifier.fillMaxWidth(), single = false) { onChange(form.copy(remarks = it)) }
    }
}

/** One of the fields, labelled as the Flight Logged sheet labels it. */
@Composable
private fun Field(
    @StringRes label: Int,
    value: String,
    modifier: Modifier,
    keyboard: KeyboardType = KeyboardType.Text,
    letters: Boolean = false,
    single: Boolean = true,
    onChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value, onValueChange = onChange, modifier = modifier, singleLine = single,
        label = { Text(stringResource(label)) },
        keyboardOptions = KeyboardOptions(capitalization = if (letters) KeyboardCapitalization.Characters else KeyboardCapitalization.Sentences, keyboardType = keyboard),
    )
}
