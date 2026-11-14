package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.gateway.PaperworkDto
import app.wingtipmaps.android.records.Paperwork
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Setup's Coming Up, for a pilot signed in: what falls due for them and
 * their airplanes, soonest first -- the flight review (14 CFR 61.56(c)),
 * the medical (61.23), passengers by day and at night (61.57(a), (b)),
 * instrument currency (61.57(c)), each airplane's inspections (91.409,
 * 91.207, 91.411, 91.413, 91.171) and the owner's ADs -- each with its
 * rule and the days or hours left, red past, orange within 30 days. The
 * gateway's list (Paperwork), the one its reminder emails are made from;
 * the dates themselves are given on the web or the iPhone for now.
 */
@Composable
fun ComingUpSection(signedInAs: String, model: ComingUpModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(signedInAs) { model.load(signedInAs) }
    Column(Modifier.fillMaxWidth()) {
        SectionTitle(stringResource(R.string.coming_up))
        val items = state.list?.items
        when {
            items == null -> Unit
            items.isEmpty() -> Text(
                stringResource(R.string.coming_up_none),
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            else -> items.forEach { due ->
                ListItem(
                    supportingContent = { Text(Paperwork.detail(due)) },
                    trailingContent = { Text(Paperwork.whenWords(due), color = toneColor(Paperwork.tone(due))) },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    content = { Text(Paperwork.named(due)) },
                )
            }
        }
        ProblemLine(state.problem)
    }
}

/**
 * Coming Up's view model (the Android audit's AND-13: the composable
 * fetched from the gateway itself and lost the list on rotation): the
 * gateway's list of what falls due, fetched once a pilot, kept across a
 * rotation; a failure kept, its words the screen's.
 */
@HiltViewModel
class ComingUpModel @Inject constructor() : ViewModel() {
    data class State(val list: PaperworkDto? = null, val problem: String? = null)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var loadedFor: String? = null

    fun load(signedInAs: String) {
        if (signedInAs == loadedFor && _state.value.problem == null) return
        loadedFor = signedInAs
        viewModelScope.launch {
            _state.value = try {
                State(list = Paperwork.fetch())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                State(problem = Problems.say("What falls due could not be fetched", e))
            }
        }
    }
}

/** Red past, amber within the window, green further off: the palette's
 *  error, caution and go, as the web's finding tones are. */
@Composable
private fun toneColor(tone: Paperwork.Tone): Color = when (tone) {
    Paperwork.Tone.PAST -> MaterialTheme.colorScheme.error
    Paperwork.Tone.SOON -> LocalWingtipPalette.current.cautionInk
    Paperwork.Tone.FINE -> LocalWingtipPalette.current.goInk
    Paperwork.Tone.UNKNOWN -> MaterialTheme.colorScheme.onSurfaceVariant
}
