package app.wingtipmaps.android.logbook

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.LogbookDraft
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * "Flight Logged" (the web's FlightLoggedSheet): the entry the engine drew
 * from the track for the pilot to change and Log, or Later, or Not a
 * Flight to Log -- never saved unasked; then what was logged, with the
 * currency the logbook now gives. Close is Later.
 */
@Composable
fun FlightLoggedSheet(state: LogbookDraftModel.State, model: LogbookDraftModel) {
    val logged = state.logged
    WingtipSheet(title = stringResource(R.string.flight_logged), onClose = { if (logged != null) model.close() else model.later() }, full = true) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        ) {
            if (logged != null) {
                Text(
                    stringResource(R.string.flight_logged_done, logged.entry.route.orEmpty(), DraftEntry.tenths(logged.entry.totalHours)),
                    style = MaterialTheme.typography.bodyLarge,
                )
                logged.currency.forEach { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                // The track not yet with its saved flight: kept here and said
                // so, with Try Again (the track send, IOS-1's Android half).
                val trackProblem by model.trackProblem.collectAsStateWithLifecycle()
                ProblemLine(trackProblem, onRetry = model::sendUnsent)
                return@Column
            }
            Text(stringResource(R.string.flight_logged_line), style = MaterialTheme.typography.bodyMedium)
            if (!state.signedIn) Text(stringResource(R.string.flight_logged_sign_in), style = MaterialTheme.typography.bodyMedium)
            if (state.pending) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                    Loading(Modifier.size(WingtipSize.Chip))
                    Text(stringResource(R.string.flight_logged_drawing), style = MaterialTheme.typography.bodyMedium)
                }
            }
            state.draftProblem?.let {
                ProblemLine(it)
                TextButton(onClick = model::retry) { Text(stringResource(R.string.try_again)) }
            }
            state.draft?.let { DraftRows(it, state, model) }
            ProblemLine(state.logProblem)
            Row(Modifier.fillMaxWidth().padding(top = WingtipSpace.Md), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                Button(onClick = model::log, enabled = state.draft != null && !state.logging) { Text(stringResource(R.string.log)) }
                TextButton(onClick = model::later) { Text(stringResource(R.string.later)) }
            }
            TextButton(onClick = model::discard) { Text(stringResource(R.string.not_a_flight)) }
        }
    }
}

/** The draft, each figure changeable and the engine's reason under it. */
@Composable
private fun DraftRows(draft: LogbookDraft, state: LogbookDraftModel.State, model: LogbookDraftModel) {
    fun shown(f: DraftField) = DraftEntry.shown(draft, state.edits, f)
    SectionTitle(stringResource(R.string.flight_logged_flight))
    Figure(stringResource(R.string.flight_logged_date), shown(DraftField.DATE), DraftEntry.why(draft, "flownOn"), text = true) { model.edit(DraftField.DATE, it) }
    Figure(stringResource(R.string.airplane), shown(DraftField.AIRPLANE), null, text = true) { model.edit(DraftField.AIRPLANE, it) }
    Figure(stringResource(R.string.flight_logged_route), shown(DraftField.ROUTE), DraftEntry.why(draft, "distanceNm"), text = true) { model.edit(DraftField.ROUTE, it) }
    SectionTitle(stringResource(R.string.flight_logged_time))
    Figure(stringResource(R.string.flight_logged_total), shown(DraftField.TOTAL), DraftEntry.why(draft, "totalHours")) { model.edit(DraftField.TOTAL, it) }
    Text(
        stringResource(R.string.flight_logged_air, DraftEntry.tenths(draft.entry.airHours)) + (DraftEntry.why(draft, "airHours")?.let { " · $it" } ?: ""),
        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Figure(stringResource(R.string.flight_logged_night), shown(DraftField.NIGHT), DraftEntry.why(draft, "nightHours")) { model.edit(DraftField.NIGHT, it) }
    Figure(stringResource(R.string.flight_logged_xc), shown(DraftField.CROSS_COUNTRY), DraftEntry.why(draft, "crossCountryHours")) { model.edit(DraftField.CROSS_COUNTRY, it) }
    SectionTitle(stringResource(R.string.flight_logged_landings))
    Figure(stringResource(R.string.flight_logged_day), shown(DraftField.DAY_LANDINGS), DraftEntry.why(draft, "landing")) { model.edit(DraftField.DAY_LANDINGS, it) }
    Figure(stringResource(R.string.flight_logged_night_full_stop), shown(DraftField.NIGHT_LANDINGS), null) { model.edit(DraftField.NIGHT_LANDINGS, it) }
    // Only where the track shows approaches or a hold; added to the entry
    // only where the pilot says it was flown by instruments (61.51(g)(1)).
    if (draft.approaches.isNotEmpty() || draft.holds.isNotEmpty()) {
        SectionTitle(stringResource(R.string.flight_logged_instrument))
        val said = listOfNotNull(DraftEntry.why(draft, "approaches"), DraftEntry.why(draft, "holding"), DraftEntry.why(draft, "tracking")).joinToString(" ")
        val n = draft.instrument.approaches
        val found = pluralStringResource(if (draft.instrument.holding) R.plurals.flight_logged_found_hold else R.plurals.flight_logged_found, n, n)
        ListItem(
            checked = state.byInstruments,
            onCheckedChange = model::byInstruments,
            supportingContent = { Text(listOf(found, said).filter { it.isNotEmpty() }.joinToString(" ")) },
            trailingContent = { Checkbox(checked = state.byInstruments, onCheckedChange = null) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            modifier = Modifier.fillMaxWidth(),
            content = { Text(stringResource(R.string.flown_by_instruments)) },
        )
    }
}

/** A figure the pilot may change, the engine's reason as its help. */
@Composable
private fun Figure(title: String, value: String, why: String?, text: Boolean = false, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value, onValueChange = onChange, modifier = Modifier.fillMaxWidth(),
        label = { Text(title) }, singleLine = true,
        supportingText = why?.let { { Text(it) } },
        keyboardOptions = KeyboardOptions(keyboardType = if (text) KeyboardType.Text else KeyboardType.Decimal),
    )
}
