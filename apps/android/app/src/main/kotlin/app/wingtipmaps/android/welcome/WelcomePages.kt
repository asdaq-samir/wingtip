package app.wingtipmaps.android.welcome

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.Skeleton
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.AirplaneModel
import app.wingtipmaps.android.ui.AirplanePicker
import app.wingtipmaps.android.ui.AirportModel
import app.wingtipmaps.android.ui.FlightRulesRow
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SuggestionRow
import app.wingtipmaps.android.welcome.WelcomeModel.Step

/**
 * One page of the welcome: its title, one plain line, and its control --
 * the Airplane tab's picker, the Airport tab's search, FPL's VFR / IFR --
 * so each is the app's own control and not a copy. The permission pages
 * are their sentence alone; the system's ask follows only Allow
 * (WelcomeSheet's buttons).
 */
@Composable
internal fun WelcomePage(step: Step, state: WelcomeModel.State, plan: Plan, model: WelcomeModel) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
        when (step) {
            Step.AIRPLANE -> {
                Words(R.string.welcome_airplane, R.string.welcome_airplane_line)
                val airplanes: AirplaneModel = viewModel()
                val profiles by airplanes.profiles.collectAsStateWithLifecycle()
                val problem by airplanes.problem.collectAsStateWithLifecycle()
                AirplanePicker(profiles, selected = state.airplane, onPick = model::pickAirplane)
                ProblemLine(problem)
            }
            Step.HOME -> {
                Words(R.string.welcome_home, R.string.welcome_home_line)
                HomeSearch(state.home, onPick = model::pickHome)
            }
            Step.RULES -> {
                Words(R.string.welcome_rules, R.string.welcome_rules_line)
                // The preference itself, set at once, and the route on the
                // page planned again by it, as FPL does.
                FlightRulesRow(onChanged = { if (plan.state.value.routed) plan.plan() })
            }
            Step.LOCATION -> Words(R.string.welcome_location, R.string.welcome_location_line)
            Step.NOTIFICATIONS -> Words(R.string.welcome_notifications, R.string.welcome_notifications_line)
            Step.FINISH -> Words(R.string.welcome_finish, R.string.welcome_finish_line)
        }
    }
}

@Composable
private fun Words(@StringRes title: Int, @StringRes line: Int) {
    Text(stringResource(title), style = MaterialTheme.typography.headlineSmall)
    Text(stringResource(line), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/** The home airport by the Airport tab's search (the planner's, a moment
 *  after typing pauses); a field tapped is the home, and the search
 *  clears. A model of its own, so the Airport tab's words are not touched. */
@Composable
private fun HomeSearch(home: String?, onPick: (String) -> Unit) {
    val search: AirportModel = viewModel(key = "welcome-home")
    val found by search.state.collectAsStateWithLifecycle()
    OutlinedTextField(
        value = found.query, onValueChange = search::search, modifier = Modifier.fillMaxWidth(),
        label = { Text(stringResource(R.string.tab_airport)) }, singleLine = true,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Search),
    )
    ProblemLine(found.problem)
    if (found.loading && found.suggestions.isEmpty()) Skeleton(rows = 2)
    if (found.query.isNotBlank()) {
        found.suggestions.take(SHOWN).forEach { field ->
            SuggestionRow(field) {
                onPick(field.ident)
                search.close()
            }
            HorizontalDivider()
        }
    }
    home?.let { Text(stringResource(R.string.welcome_home_is, it), style = MaterialTheme.typography.titleMedium) }
}

/** Search results shown at once, the page's room. */
private const val SHOWN = 5
