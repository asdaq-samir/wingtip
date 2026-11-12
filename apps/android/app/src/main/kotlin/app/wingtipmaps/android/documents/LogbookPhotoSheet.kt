package app.wingtipmaps.android.documents

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.assistant.LogbookEntryDraft
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.logbook.DraftEntry
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * The logbook's "Add from a Photo" sheet: Scan the Page, then the page's
 * own flags (its totals against its rows) and a row a flight, each with
 * its date, route, airplane, time and landings and the engine's flags,
 * confirmed one by one; a row with no date read cannot be. "Log N
 * Flights" logs the confirmed ones.
 */
@Composable
fun LogbookPhotoSheet(onClose: () -> Unit, model: LogbookPhotoModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scan = rememberPageScanner(onPage = { model.read(context, it) }, onProblem = model::problem)
    WingtipSheet(title = stringResource(R.string.add_from_photo), onClose = { model.clear(); onClose() }, full = true) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        ) {
            val answer = state.answer
            if (answer == null) {
                Text(stringResource(R.string.photo_logbook_line), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (state.reading) ReadingLine()
                ProblemLine(state.problem)
                Button(onClick = scan, enabled = !state.reading, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.scan_page)) }
                return@Column
            }
            ReadNotes(answer)
            val check = answer.logbookCheck
            check?.flags?.let { FlagLines(it) }
            if (check != null && check.rows.isNotEmpty()) Text(stringResource(R.string.photo_review_line), style = MaterialTheme.typography.bodyMedium)
            check?.rows.orEmpty().forEachIndexed { i, row ->
                val dated = LogbookReview.canConfirm(row)
                val logged = i in state.logged
                ConfirmRow(
                    title = route(row.entry),
                    overline = row.entry.flownOn ?: stringResource(R.string.no_date_read),
                    checked = i in state.confirmed,
                    enabled = dated && !logged && !state.logging,
                    onToggle = { model.toggle(i) },
                ) {
                    Text(figures(row.entry), style = MaterialTheme.typography.bodyMedium)
                    FlagLines(row.flags)
                    if (logged) Text(stringResource(R.string.logged_row), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    ProblemLine(state.rowProblems[i])
                }
            }
            ProblemLine(state.problem)
            val n = state.toLog
            Button(onClick = model::logConfirmed, enabled = n > 0 && !state.logging, modifier = Modifier.fillMaxWidth()) {
                Text(pluralStringResource(R.plurals.log_flights, n, n))
            }
            TextButton(onClick = scan, enabled = !state.logging) { Text(stringResource(R.string.scan_again)) }
        }
    }
}

/** "KANE KSTC", or the airplane where no route was read. */
private fun route(e: LogbookEntryDraft): String = e.route?.ifBlank { null } ?: e.aircraft ?: "—"

/** "N12345 C172 · 1.4 h · 1 landing", as the logbook's own rows read. */
private fun figures(e: LogbookEntryDraft): String {
    val landings = (e.dayLandings ?: 0) + (e.nightLandings ?: 0)
    return listOfNotNull(
        listOfNotNull(e.aircraft, e.aircraftType).joinToString(" ").ifEmpty { null },
        e.totalHours?.let { "${DraftEntry.tenths(it)} h" },
        if (landings == 1) "1 landing" else "$landings landings",
    ).joinToString(" · ")
}
