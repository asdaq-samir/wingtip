package app.wingtipmaps.android.strip

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.input.clearText
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExpandedFullScreenSearchBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SearchBar
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSearchBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.api.Pilot
import app.wingtipmaps.android.atc.RadioListener
import app.wingtipmaps.android.atc.micAllowed
import app.wingtipmaps.android.design.generated.WingtipSpace
import kotlinx.coroutines.launch

/**
 * The one row the sheet shows at its foot, in every state (the owner's
 * change of 2026-11-04 after Apple Maps: the handle and this row alone
 * when the sheet is down): Material's search bar -- the search glyph
 * leading, "Where to, or ask" as its placeholder, the microphone as its
 * trailing icon -- with the round profile button beside it at the right.
 * What it takes is read by FieldCommands.readField and done by StripModel:
 * idents are a route, a name a place, a screen's word that screen,
 * anything else a question for the assistant. Tapped, the bar opens full
 * screen, as Material's does, with the suggestions as chips while nothing
 * is typed, each one tap; the microphone hears one thing said with the
 * phone's on-device recognizer (RadioListener.once) and the words come
 * back as if typed. Why a line could not be done is said under the row.
 *
 * In the air the field is the radio: nothing is typed, the microphone is
 * the way in, and the placeholder says so. Where speech cannot be
 * recognised on the phone (RadioListener.canListen) there is no
 * microphone: nothing said is ever sent to a server's recognizer.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FieldRow(
    suggestions: List<String>,
    pilot: Pilot?,
    flying: Boolean,
    problem: String?,
    onLine: (String) -> Unit,
    onOpen: (StripModel.Over) -> Unit,
    onSignOut: () -> Unit,
    onProblem: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val searchBarState = rememberSearchBarState()
    val textFieldState = rememberTextFieldState()
    val scope = rememberCoroutineScope()

    fun submit(words: String) {
        val line = words.trim()
        if (line.isEmpty()) return
        textFieldState.clearText()
        scope.launch { searchBarState.animateToCollapsed() }
        onLine(line)
    }

    // The phone's on-device recognizer, as the ATC copilot hears with:
    // not the system's recognizer intent, whose service may send the
    // audio away. The microphone is asked for from the tap, as Android's
    // guidance has it.
    val context = LocalContext.current
    val voice = remember(context) { RadioListener.canListen(context) }
    val hearOnce = {
        scope.launch {
            val words = RadioListener.of(context).once()
            if (!words.isNullOrBlank()) submit(words) else onProblem("Nothing was heard.")
        }
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) hearOnce() else onProblem("Allow the microphone to say it.")
    }
    val listen = {
        if (micAllowed(context)) hearOnce() else ask.launch(Manifest.permission.RECORD_AUDIO)
    }

    val placeholder = if (flying && voice) "Tap the mic and say it" else "Where to, or ask"
    val inputField: @Composable () -> Unit = {
        SearchBarDefaults.InputField(
            searchBarState = searchBarState,
            textFieldState = textFieldState,
            onSearch = ::submit,
            enabled = !flying,
            placeholder = { Text(placeholder) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = if (voice) {
                {
                    IconButton(onClick = { listen() }, enabled = true) {
                        Icon(Icons.Filled.Mic, contentDescription = "Say it", tint = MaterialTheme.colorScheme.primary)
                    }
                }
            } else {
                null
            },
            modifier = Modifier.semantics { contentDescription = if (flying) "The radio" else "Where to, or ask" },
        )
    }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        Row(
            Modifier.fillMaxWidth().padding(start = WingtipSpace.Lg, end = WingtipSpace.Xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xs),
        ) {
            SearchBar(state = searchBarState, inputField = inputField, modifier = Modifier.weight(1f))
            ProfileButton(pilot = pilot, onOpen = onOpen, onSignOut = onSignOut)
        }
        if (problem != null) {
            Text(
                problem, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = WingtipSpace.Lg),
            )
        }
    }

    // What a pilot asks first, and the planner's other screens, as chips
    // while nothing is typed: how the rest is found without tabs.
    ExpandedFullScreenSearchBar(state = searchBarState, inputField = inputField) {
        if (textFieldState.text.isEmpty() && suggestions.isNotEmpty()) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Md),
                horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
            ) {
                suggestions.forEach { words ->
                    SuggestionChip(onClick = { submit(words) }, label = { Text(words) })
                }
            }
        }
    }
}
