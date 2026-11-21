package app.wingtipmaps.android.airplane

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * A figure missing where it is needed, asked for in place (the owner,
 * 2026-11-09): "How much fuel does N123AB use to start and taxi?", its
 * field, and Save (to the airplane's record, the account's or this
 * phone's, the figure then worked out), Not Now (this one put off for the
 * launch, the rest still shown) and Edit N123AB (its whole profile, at
 * this figure). `figure` is what the screen shows, by the engine's
 * airplane_needs name (fuel_totals, glide, climb, weight_balance); with
 * no airplane nothing is asked here, as picking one is.
 */
@Composable
fun AskFigures(airplane: AirplaneNow, figure: String, modifier: Modifier = Modifier) {
    val hidden by NotNow.hidden.collectAsStateWithLifecycle()
    val asks = remember(airplane, figure, hidden) { AirplaneNow.asks(airplane, figure, hidden) }
    if (asks.isEmpty()) return
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        asks.forEach { AskFigure(airplane, it) }
    }
}

@Composable
private fun AskFigure(airplane: AirplaneNow, key: FigureKey) {
    val context = LocalContext.current
    val own = remember(context) { OwnAirplanes.of(context) }
    val scope = rememberCoroutineScope()
    // The field's own text, the figure's alone: a new figure asked starts empty.
    val field = rememberSaveable(key, saver = TextFieldState.Saver) { TextFieldState() }
    // Held as states, read and set by .value where the save's coroutine sets them.
    val saving = remember { mutableStateOf(false) }
    val problem = remember { mutableStateOf<String?>(null) }
    val name = airplane.name ?: stringResource(R.string.this_airplane)
    val value = FigureKey.parse(key, field.text.toString())
    val couldNot = stringResource(R.string.profile_problem, "%s")
    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainerHigh, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(WingtipSpace.Md), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
            Text(stringResource(key.question, name), style = MaterialTheme.typography.bodyMedium)
            OutlinedTextField(
                state = field,
                label = { Text(stringResource(key.label)) },
                suffix = { Text(key.unit) },
                lineLimits = TextFieldLineLimits.SingleLine,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done),
                modifier = Modifier.fillMaxWidth(),
            )
            ProblemLine(problem.value)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { ProfileOpen.open(airplane.tail, key.key) }) { Text(stringResource(R.string.ask_edit, name)) }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { NotNow.hide(key.key) }) { Text(stringResource(R.string.not_now)) }
                Button(
                    enabled = value != null && !saving.value,
                    onClick = {
                        scope.launch {
                            saving.value = true
                            problem.value = try {
                                own.save(airplane.base(), mapOf(key.key to value))
                                null
                            } catch (e: CancellationException) {
                                throw e
                            } catch (e: Exception) {
                                couldNot.replace("%s", (e as? Gateway.Refusal)?.words ?: e.message.orEmpty())
                            }
                            saving.value = false
                        }
                    },
                ) { Text(stringResource(R.string.save)) }
            }
        }
    }
}
