package app.wingtipmaps.android.balance

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.AskFigures
import app.wingtipmaps.android.airplane.rememberAirplaneNow
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.ui.FullScreenPage
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.rememberFieldText
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.util.Locale

/**
 * Weight and balance on the phone and the tablet (the market-gap report's
 * item 8, the web's Brief Loading page): the airplane flown's loading,
 * each station's pounds and the fuel typed in (stock Material 3 text
 * fields), the engine's takeoff and landing against the POH's limits
 * (14 CFR 91.9(a)), what is out of them, and the CG envelope with both
 * points on it (EnvelopeChart). No airplane picked, it says to pick one;
 * an airplane missing its empty weight or moment asks for them here, in
 * place (AskFigures, the engine's airplane_needs "weight_balance"), and
 * the rest works out once they are given. Full screen, as the airport
 * diagram and a plate are, so a tablet has the room.
 */
@Composable
fun BalancePage(plan: Plan, onClose: () -> Unit, model: BalanceModel = hiltViewModel()) {
    val airplane = rememberAirplaneNow(plan)
    val planned by plan.state.collectAsStateWithLifecycle()
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(airplane, planned.totals?.fuelGal) { model.asked(airplane, planned.totals?.fuelGal) }
    FullScreenPage(title = stringResource(R.string.balance), onClose = onClose) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(WingtipSpace.Lg),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md),
            horizontalAlignment = Alignment.Start,
        ) {
            if (airplane.name == null) {
                Text(stringResource(R.string.balance_no_airplane), style = MaterialTheme.typography.bodyLarge)
                return@Column
            }
            AskFigures(airplane, "weight_balance")
            val loading = state.loading
            if (loading == null) {
                Text(stringResource(R.string.balance_no_loading), style = MaterialTheme.typography.bodyLarge)
                return@Column
            }
            Loads(state, loading, model)
            ProblemLine(state.problem)
            state.balance?.let { Results(it, loading) }
        }
    }
}

/** The empty airplane, then each station and the fuel, as typed. */
@Composable
private fun Loads(state: BalanceModel.State, loading: EngineContract.GonogoLoading, model: BalanceModel) {
    SectionTitle(stringResource(R.string.balance_empty))
    Text(weighs(state.emptyWeightLb, state.emptyArmIn), style = MaterialTheme.typography.bodyLarge)
    loading.stations.orEmpty().forEachIndexed { i, station ->
        key(i) {
            Figure(
            label = station.name, value = state.stations.getOrElse(i) { "" }, suffix = "lb",
            most = station.maxLb?.let { String.format(Locale.US, "Most %,.0f lb", it) },
            ) { model.setStation(i, it) }
        }
    }
    if (state.grades.size > 1) GradePicker(state, model)
    Figure(
        label = stringResource(R.string.balance_fuel), value = state.fuel, suffix = "gal",
        most = String.format(Locale.US, "Most %,.0f gal", loading.fuelMaxGal), last = true,
    ) { model.setFuel(it) }
}

/** The fuel's grade, as Material's segmented buttons (a discrete
 *  setting): its weight a gallon is the engine's (fuel_grades). */
@Composable
private fun GradePicker(state: BalanceModel.State, model: BalanceModel) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        state.grades.forEachIndexed { i, g ->
            SegmentedButton(
                selected = g.grade == state.grade,
                onClick = { model.setGrade(g.grade) },
                shape = SegmentedButtonDefaults.itemShape(i, state.grades.size),
                label = { Text(g.name) },
            )
        }
    }
}

@Composable
private fun Figure(label: String, value: String, suffix: String, most: String?, last: Boolean = false, onChange: (String) -> Unit) {
    OutlinedTextField(
        state = rememberFieldText(value, onChange),
        label = { Text(label) },
        suffix = { Text(suffix) },
        supportingText = most?.let { { Text(it) } },
        lineLimits = TextFieldLineLimits.SingleLine,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = if (last) ImeAction.Done else ImeAction.Next),
        modifier = Modifier.fillMaxWidth(),
    )
}

/** Takeoff and landing, what is out of limits, and the envelope. */
@Composable
private fun Results(balance: EngineContract.GonogoBalanceAnswer, loading: EngineContract.GonogoLoading) {
    SectionTitle(stringResource(R.string.balance_takeoff))
    Text(balance.takeoffWords, style = MaterialTheme.typography.bodyLarge)
    SectionTitle(stringResource(R.string.balance_landing))
    Text(weighs(balance.landing.weightLb, balance.landing.armIn), style = MaterialTheme.typography.bodyLarge)
    if (balance.problems.isEmpty()) {
        Text(stringResource(R.string.balance_within), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
    } else {
        balance.problems.forEach { Text(it, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.error) }
    }
    val envelope = loading.envelope.orEmpty().mapNotNull { p ->
        val arm = p.getOrNull(0)?.jsonPrimitive?.doubleOrNull
        val weight = p.getOrNull(1)?.jsonPrimitive?.doubleOrNull
        if (arm != null && weight != null) EnvelopePoint(arm, weight) else null
    }
    if (envelope.size >= 3) {
        SectionTitle(stringResource(R.string.balance_envelope))
        val point = { w: Double, arm: Double? -> arm?.let { EnvelopePoint(it, w) } }
        val said = "Takeoff ${balance.takeoffWords}. Landing ${weighs(balance.landing.weightLb, balance.landing.armIn)}."
        EnvelopeChart(envelope, point(balance.takeoff.weightLb, balance.takeoff.armIn), point(balance.landing.weightLb, balance.landing.armIn), said)
    }
}

/** "2,407 lb at 41.2 in", as the engine's takeoff_words write it; "no CG"
 *  with nothing aboard (the web's armText). */
private fun weighs(weightLb: Double, armIn: Double?): String =
    String.format(Locale.US, "%,.0f lb at %s", weightLb, armIn?.let { String.format(Locale.US, "%.1f in", it) } ?: "no CG")
