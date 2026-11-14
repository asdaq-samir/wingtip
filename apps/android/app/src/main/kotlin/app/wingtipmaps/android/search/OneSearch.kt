package app.wingtipmaps.android.search

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.input.clearText
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExpandedDockedSearchBarWithGap
import androidx.compose.material3.ExpandedFullScreenSearchBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SearchBar
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.SearchBarValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSearchBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.account.AccountButton
import app.wingtipmaps.android.account.SearchBarAvatar
import app.wingtipmaps.android.ai.rememberAiOffered
import app.wingtipmaps.android.airplane.OwnAirplanes
import app.wingtipmaps.android.api.Pilot
import app.wingtipmaps.android.atc.RadioListener
import app.wingtipmaps.android.atc.micAllowed
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.ui.WingtipIcons
import app.wingtipmaps.android.ui.isWide
import app.wingtipmaps.android.voice.VoiceInput
import kotlinx.coroutines.launch

/**
 * The sheet's first row in both layouts, where the tabs were (the owner's
 * one search, 2026-11-09): Material's search bar, "Search or ask" (read
 * out as "Search airports, airplanes, or ask"), with the microphone and
 * the account's avatar (AccountButton, Settings in one tap) in the bar's
 * own trailing slot, as Google Maps has them (the owner, 2026-11-10).
 * While a card is
 * open its bar takes this row's place (CardPage). Tapped, the bar opens
 * full screen, as Material's does: with nothing typed the flight's card,
 * Nearest, Favorites and Recents; typing, the results grouped (Airports,
 * Waypoints and Navaids, Airplanes, Do), each one tap (SearchPick, done by
 * the root). The keyboard's search key does the line as the strip's field
 * did (FieldCommands: a route, a field, a screen's word, else a question).
 *
 * The microphone is Ask by voice (VoiceInput), Material's voice input on
 * a search bar: a stock icon toggle, checked while it listens, the field
 * asking to "Speak your question" and the words appearing in it as they
 * are said, then done as if typed -- the phone's on-device recognizer,
 * never a server's; where speech cannot be recognised on the phone there
 * is no microphone. Nothing of the radio's (the ATC copilot's capsule,
 * its mark and words) is used for it: the owner, 2026-11-10. In the air the field is the radio: nothing is typed
 * and the placeholder says to tap the mic. Why a line could not be done
 * is said under the row.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OneSearch(
    plan: Plan,
    ownShip: OwnShip,
    pilot: Pilot?,
    flying: Boolean,
    problem: String?,
    control: SearchControl,
    onLine: (String) -> Unit,
    onPick: (SearchPick) -> Unit,
    onProblem: (String) -> Unit,
    modifier: Modifier = Modifier,
    model: SearchModel = hiltViewModel(),
) {
    val searchBarState = rememberSearchBarState()
    val textFieldState = rememberTextFieldState()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val state by model.state.collectAsStateWithLifecycle()
    val planState by plan.state.collectAsStateWithLifecycle()
    val fix by ownShip.fix.collectAsStateWithLifecycle()
    val memory = remember(context) { SearchMemory.of(context) }
    val favorites by memory.favorites.collectAsStateWithLifecycle()
    val recents by memory.recents.collectAsStateWithLifecycle()
    val own by remember(context) { OwnAirplanes.of(context) }.records.collectAsStateWithLifecycle()
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()

    // Opened from elsewhere: an Airport link, the plan's Add a Stop.
    LaunchedEffect(control.asked) { if (control.takeAsk()) searchBarState.animateToExpanded() }
    LaunchedEffect(searchBarState) {
        snapshotFlow { searchBarState.currentValue }.collect { if (it == SearchBarValue.Collapsed) control.done() }
    }
    LaunchedEffect(textFieldState, own) {
        snapshotFlow { textFieldState.text.toString() }.collect { model.type(it, own.values, fix?.let { f -> f.lat to f.lon }) }
    }
    LaunchedEffect(fix != null) { fix?.let { model.loadNearest(it.lat, it.lon) } }

    fun close() {
        textFieldState.clearText()
        scope.launch { searchBarState.animateToCollapsed() }
    }

    fun submit(words: String) {
        val line = words.trim()
        if (line.isEmpty()) return
        close()
        onLine(line)
    }

    val pick: (SearchPick) -> Unit = { picked ->
        when (picked) {
            is SearchPick.Airport -> memory.picked(Remembered(Remembered.Kind.AIRPORT, picked.ident, picked.name, closed = picked.closed))
            is SearchPick.Airplane -> memory.picked(Remembered(Remembered.Kind.AIRPLANE, picked.tail ?: picked.name, type = picked.type))
            else -> {}
        }
        close()
        onPick(picked)
    }

    val voice = remember(context) { RadioListener.canListen(context) }
    val speech = remember(context) { VoiceInput.of(context) }
    val listening by speech.listening.collectAsStateWithLifecycle()
    val heard by speech.words.collectAsStateWithLifecycle()
    // The words in the field as they are said.
    LaunchedEffect(heard) { if (heard.isNotEmpty()) textFieldState.setTextAndPlaceCursorAtEnd(heard) }
    val nothingHeard = stringResource(R.string.nothing_heard)
    val allowMic = stringResource(R.string.allow_microphone)
    val radioBusy = stringResource(R.string.voice_radio_busy)
    val hearOnce: () -> Unit = {
        scope.launch {
            // The radio has the microphone while it is listened to.
            if (RadioListener.of(context).listening.value) {
                onProblem(radioBusy)
                return@launch
            }
            textFieldState.clearText()
            val words = speech.hear()
            // Nothing heard: why, where the recognizer said (RecognizerErrors).
            if (!words.isNullOrBlank()) submit(words) else onProblem(speech.problem.value ?: nothingHeard)
        }
    }
    // The microphone asked for from the tap, as Android's guidance has it.
    val askMic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) hearOnce() else onProblem(allowMic)
    }

    val after = control.stopAfter
    val placeholder = if (after != null && !listening) {
        stringResource(R.string.point_add_stop_after_title, after)
    } else {
        stringResource(
            when {
                listening -> R.string.voice_speak
                control.picking != null -> control.pickHint
                control.addingStop -> R.string.search_add_stop
                flying && voice -> R.string.search_hint_flying
                else -> R.string.search_hint
            },
        )
    }
    // The short placeholder is what fits one line; TalkBack reads the
    // whole sentence for it (the sheet audit's S-1, 2026-11-10).
    val spokenHint = stringResource(R.string.search_hint_spoken)
    val placeholderSpoken = if (placeholder == stringResource(R.string.search_hint)) spokenHint else placeholder
    val open = searchBarState.currentValue == SearchBarValue.Expanded
    val back = stringResource(R.string.back)
    val clear = stringResource(R.string.said_clear_search)
    // Material's icon toggle, checked while it listens; a second tap ends it.
    val mic: @Composable () -> Unit = {
        IconToggleButton(
            checked = listening,
            onCheckedChange = { on ->
                when {
                    !on -> speech.finish()
                    micAllowed(context) -> hearOnce()
                    else -> askMic.launch(Manifest.permission.RECORD_AUDIO)
                }
            },
        ) {
            Icon(Icons.Filled.Mic, contentDescription = stringResource(if (listening) R.string.voice_listening else R.string.say_it))
        }
    }
    val inputField: @Composable () -> Unit = {
        SearchBarDefaults.InputField(
            searchBarState = searchBarState,
            textFieldState = textFieldState,
            onSearch = ::submit,
            enabled = !flying,
            // One line at every font scale, so the bar stays Material's
            // 56 dp and the peek fits under it.
            placeholder = {
                Text(placeholder, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.semantics { contentDescription = placeholderSpoken })
            },
            // Open, the stock expanded search bar's ← closes it, as
            // Material's own sample has it; closed, the search glyph.
            leadingIcon = {
                if (open) {
                    IconButton(onClick = { scope.launch { searchBarState.animateToCollapsed() } }) { Icon(WingtipIcons.back, contentDescription = back) }
                } else {
                    Icon(Icons.Filled.Search, contentDescription = null)
                }
            },
            // The bar's own trailing slot, as Google Maps' search bar has it
            // (the owner's decision, 2026-11-10, on the audit's S-2): the
            // mic, then the account's avatar, in that order; open and typed
            // into, the stock clear.
            trailingIcon = {
                if (open && textFieldState.text.isNotEmpty()) {
                    IconButton(onClick = { textFieldState.clearText() }) { Icon(Icons.Filled.Close, contentDescription = clear) }
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (voice) mic()
                        if (!open) AccountButton(pilot = pilot, avatar = SearchBarAvatar)
                    }
                }
            },
        )
    }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        SearchBar(state = searchBarState, inputField = inputField, modifier = Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg))
        if (problem != null) {
            Text(problem, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = WingtipSpace.Lg))
        }
    }

    // The kinds the typed results are narrowed to by the filter chips.
    var chosen by remember { mutableStateOf(emptySet<ResultKind>()) }
    val results: @Composable ColumnScope.() -> Unit = {
        val typed = textFieldState.text.isNotBlank()
        val asked = rememberAiOffered()
        val actions = remember(state.query, state.airports, state.waypoints, planState.routed, fix != null, asked) {
            SearchGroups.actions(state.query, planState.routed, fix != null, FieldMarks.firstOffered(state.airports, state.waypoints), asked)
        }
        LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(bottom = WingtipSpace.Xl)) {
            if (typed) {
                kindFilters(chosen) { kind -> chosen = if (kind in chosen) chosen - kind else chosen + kind }
                searchResults(state, actions, routed = planState.routed, hasFix = fix != null, chosen = chosen, onPick = pick)
            } else {
                if (!control.addingStop) {
                    item(key = "flight") {
                        FlightCard(planState, tail = tail, onOpen = { pick(SearchPick.Flight) }, modifier = Modifier.padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm))
                    }
                }
                nothingTyped(favorites, own.values, recents, state.nearest, state.nearestProblem, fix, onPick = pick)
            }
        }
    }
    // A phone's search opens over the whole screen, as Material's does on
    // a compact window; beside the map on a tablet or an unfolded phone it
    // drops down from the bar instead, the map left in sight (Material's
    // docked search for medium windows and wider).
    if (isWide()) {
        ExpandedDockedSearchBarWithGap(state = searchBarState, inputField = inputField, content = results)
    } else {
        ExpandedFullScreenSearchBar(state = searchBarState, inputField = inputField, content = results)
    }
}
