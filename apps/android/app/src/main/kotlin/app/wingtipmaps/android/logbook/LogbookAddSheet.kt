package app.wingtipmaps.android.logbook

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * Add Flight, the logbook's extended button: a full-height sheet with a
 * logbook line's fields (LogbookFields) and Save at its foot, the
 * primary action near the thumb as Material puts a form's. Nothing is
 * filled in but today's date, so no figure is guessed for the pilot.
 */
@Composable
fun LogbookAddSheet(state: LogbookModel.State, model: LogbookModel) {
    var form by rememberSaveable(stateSaver = FormSaver) { mutableStateOf(LogbookForm.new(AppClock.today())) }
    // Anything typed past today's date is an edit to ask about before a swipe throws it away.
    val edited = form != LogbookForm.new(AppClock.today())
    WingtipSheet(title = stringResource(R.string.logbook_add_flight), onClose = model::closeAdd, full = true, edited = edited) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        ) {
            LogbookFields(form) { form = it }
            ProblemLine(state.addProblem)
            Button(onClick = { model.add(form) }, enabled = !state.saving, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(if (state.saving) R.string.logbook_saving else R.string.save))
            }
        }
    }
}

/** The typed fields kept across a rotation, as their eight strings. */
private val FormSaver = listSaver<LogbookForm, String>(
    save = { listOf(it.date, it.route, it.airplane, it.total, it.night, it.dayLandings, it.nightLandings, it.remarks) },
    restore = { LogbookForm(it[0], it[1], it[2], it[3], it[4], it[5], it[6], it[7]) },
)
