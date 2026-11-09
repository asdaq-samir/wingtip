package app.wingtipmaps.android.trip

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.assistant.Context
import app.wingtipmaps.android.api.generated.assistant.Source
import app.wingtipmaps.android.api.generated.assistant.TripLeg
import app.wingtipmaps.android.design.LoadingIndicator
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.WingtipIcons
import java.time.Instant

/**
 * "Plan a Trip" in the Ask, as the web's TripPlanner: the trip in the
 * pilot's words, the tool in use while it works, then the proposal -- the
 * reason in the planner's words, each leg with its figures and its Use,
 * the constraints it could not meet said plainly, and the reports it rests
 * on. What went wrong is said in place.
 */
@Composable
fun TripPlannerCard(
    model: TripPlannerModel,
    context: () -> Context,
    onUse: (TripLeg) -> Unit,
    onSource: (Source) -> Unit,
    onClose: () -> Unit,
) {
    val state by model.state.collectAsStateWithLifecycle()
    var text by rememberSaveable { mutableStateOf("") }
    fun send() {
        if (text.isBlank() || state.busy) return
        model.plan(text, context())
    }
    Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
        SectionTitle(stringResource(R.string.trip_title))
        if (state.asked.isNotEmpty()) {
            Text(
                state.asked,
                Modifier.align(Alignment.End).background(MaterialTheme.colorScheme.primary, MaterialTheme.shapes.large)
                    .padding(horizontal = WingtipSpace.Md, vertical = WingtipSpace.Sm),
                color = MaterialTheme.colorScheme.onPrimary,
            )
        }
        state.status?.let { status ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                LoadingIndicator(Modifier.size(WingtipSpace.Lg))
                Text("$status…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        val proposal = state.proposal
        if (proposal != null || state.words.isNotEmpty()) {
            Column(
                Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.large)
                    .padding(WingtipSpace.Md),
                verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md),
            ) {
                if (state.words.isNotEmpty()) Text(state.words)
                proposal?.legs?.forEach { leg ->
                    TripLegRow(leg, used = leg.kind in state.used, onUse = { onUse(leg); model.used(leg) })
                }
                proposal?.unmet?.forEach { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
                if (!state.busy) {
                    state.sources.forEach { source -> AssistChip(onClick = { onSource(source) }, label = { Text(source.label) }) }
                }
            }
        }
        ProblemLine(state.error)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            OutlinedTextField(
                value = text, onValueChange = { text = it }, modifier = Modifier.weight(1f),
                placeholder = { Text(stringResource(R.string.trip_describe)) }, singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { send() }),
            )
            if (state.busy) {
                IconButton(onClick = model::stop) { Icon(WingtipIcons.stop, contentDescription = stringResource(R.string.trip_stop)) }
            } else {
                IconButton(onClick = ::send, enabled = text.isNotBlank()) {
                    Icon(WingtipIcons.send, contentDescription = stringResource(R.string.trip_send), tint = MaterialTheme.colorScheme.primary)
                }
            }
            IconButton(onClick = { model.clear(); onClose() }) {
                Icon(WingtipIcons.close, contentDescription = stringResource(R.string.trip_close))
            }
        }
    }
}

/** One leg: its route, when it leaves and lands on this phone's clock,
 *  its altitude, distance, time and fuel, all the planner's, the go window
 *  it leaves in, and the planner's cautions; Use loads it. */
@Composable
private fun TripLegRow(leg: TripLeg, used: Boolean, onUse: () -> Unit) {
    val route = (listOf(leg.change.dep) + leg.change.stops + leg.change.dest).joinToString(" → ")
    val clock = { iso: String -> Format.clock(Instant.parse(iso).toEpochMilli()) }
    val leave = clock(leg.change.depart)
    val land = leg.arrive?.let { ", " + stringResource(R.string.trip_land, clock(it)) } ?: ""
    val window = leg.window?.let { " · " + stringResource(R.string.trip_window, clock(it.start), clock(it.last)) } ?: ""
    val figures = listOfNotNull(
        leg.altitudeFt?.let(Format::altitude), leg.distanceNm?.let(Format::distance),
        leg.eteMin?.let(Format::duration), leg.fuelGal?.let(Format::fuel),
    ).joinToString(" · ")
    Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        Text(route, fontWeight = FontWeight.SemiBold)
        Text(stringResource(if (leg.kind == "return") R.string.trip_back else R.string.trip_leave, leave) + land + window)
        if (figures.isNotEmpty()) {
            Text(figures, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        leg.cautions.forEach { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
        val label = when {
            used -> R.string.trip_loaded
            leg.kind == "return" -> R.string.trip_use_return
            else -> R.string.trip_use
        }
        if (used) {
            FilledTonalButton(onClick = {}, enabled = false) { Text(stringResource(label)) }
        } else {
            Button(onClick = onUse) { Text(stringResource(label)) }
        }
    }
}
