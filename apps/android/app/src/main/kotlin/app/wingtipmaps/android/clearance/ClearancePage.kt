package app.wingtipmaps.android.clearance

import android.Manifest
import android.os.Build
import android.view.HapticFeedbackConstants
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.atc.Heard
import app.wingtipmaps.android.atc.RadioListener
import app.wingtipmaps.android.atc.micAllowed
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.documents.ClearancePhotoRow
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.ui.LocalInk
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.WingtipIcons
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage
import java.util.Locale

/**
 * The clearance card (the web's ClearanceCard, the iPhone's
 * ClearanceSheet): its four steps in a row (Hear, Read back, Enter,
 * Compare); the clearance typed, read off a photo of the pilot's note, or
 * heard on the phone's own recognizer (where it has one: voice is not
 * offered otherwise); laid out as CRAFT (cleared to, route, altitude,
 * frequency, transponder; AIM 4-4-3); the pilot's read back checked by
 * the engine line by line; the route cleared against the one filed; and
 * Enter the Route, which plans it at the altitude to expect (else the
 * one to maintain). A page over the search (CardPage), Listen in its bar,
 * from the search's "clearance" or "radio" and the strip's chip alike.
 * The transcript folds under them. Enter the Route, the card's one filled
 * button, and Read Back Again sit at the page's foot, out of the scroll, where the thumb finds them every time
 * (Material's bottom action, Google's finding on big actions near the
 * thumb); the clearance understood is felt as Android's Confirm.
 */
@Composable
fun ClearancePage(plan: Plan, fix: OwnShip.Fix?, exit: CardExit, onEntered: () -> Unit) {
    val context = LocalContext.current
    val voice = remember(context) { RadioListener.canListen(context) }
    val radio = remember(context) { if (voice) RadioListener.of(context) else null }
    val model = hiltViewModel<ClearanceModel, ClearanceModel.Factory> { it.create(radio) }
    val state by model.state.collectAsStateWithLifecycle()
    val planned by plan.state.collectAsStateWithLifecycle()
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    val listening = radio?.listening?.collectAsStateWithLifecycle()?.value == true
    val heardLog = radio?.heard?.collectAsStateWithLifecycle()?.value.orEmpty()
    val radioError = radio?.error?.collectAsStateWithLifecycle()?.value
    var allowed by remember { mutableStateOf(micAllowed(context)) }
    var afterAllowed by remember { mutableStateOf<(() -> Unit)?>(null) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        allowed = it
        if (it) afterAllowed?.invoke()
        afterAllowed = null
    }
    // The microphone asked for in the moment it is needed, never before.
    val withMic: (() -> Unit) -> Unit = { go ->
        if (allowed) go() else {
            afterAllowed = go
            ask.launch(Manifest.permission.RECORD_AUDIO)
        }
    }
    LaunchedEffect(planned.dep, planned.stops, planned.dest, planned.course, fix?.lat, fix?.lon) {
        val points = listOfNotNull(
            planned.course?.departure?.let { it.lat to it.lon }, planned.course?.destination?.let { it.lat to it.lon }, fix?.let { it.lat to it.lon },
        )
        model.flight(ClearanceModel.Flight(planned.dep, planned.stops, planned.dest, points.joinToString(";") { String.format(Locale.US, "%.4f,%.4f", it.first, it.second) }))
    }
    var transcript by rememberSaveable { mutableStateOf(false) }
    // Felt once as the clearance comes to be understood, not on opening a
    // card that already has one.
    val understood = state.clearance != null && state.heard
    val haptics = rememberHaptics()
    var wasUnderstood by remember { mutableStateOf(understood) }
    LaunchedEffect(understood) {
        if (understood && !wasUnderstood) haptics.tap(UNDERSTOOD)
        wasUnderstood = understood
    }
    CardPage(
        title = stringResource(R.string.clearance), exit = exit,
        actions = {
            if (radio != null) {
                FilledTonalButton(onClick = { if (listening) model.stopListening() else withMic(model::listen) }) {
                    Icon(if (listening) Icons.Filled.Stop else WingtipIcons.radio, contentDescription = null)
                    Text(stringResource(if (listening) R.string.clearance_stop else R.string.clearance_listen), Modifier.padding(start = WingtipSpace.Xs))
                }
            }
        },
        bottomBar = {
            if (state.clearance != null && state.heard) {
                // The card's actions at its foot, out of the scroll, as wide as
                // the sheet; the sheet itself clears the gesture bar.
                Surface(color = MaterialTheme.colorScheme.surfaceContainer, modifier = Modifier.fillMaxWidth()) {
                    Row(
                        Modifier.padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm),
                        horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
                    ) {
                        if (radio != null) {
                            OutlinedButton(onClick = { withMic(model::readBackAgain) }, modifier = Modifier.weight(1f)) {
                                Text(stringResource(R.string.clearance_read_back_again))
                            }
                        }
                        Button(
                            onClick = {
                                model.entry()?.let { e -> plan.useLeg(e.dep, e.dest, e.stops, e.altitudeFt ?: planned.altitudeFt, planned.depart) }
                                onEntered()
                            },
                            enabled = state.ready,
                            modifier = Modifier.weight(1f),
                        ) { Text(stringResource(R.string.clearance_enter)) }
                    }
                }
            }
        },
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Md),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        ) {
            // The flight the clearance is for, as the canvas heads it.
            val head = listOfNotNull(if (planned.dep.isEmpty()) null else "${planned.dep} → ${planned.dest}", "IFR", tail).joinToString(" · ")
            Text(head, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Steps(state.steps)
            val clearance = state.clearance
            if (clearance == null || !state.heard) WordsField(state.text, model::type, voice)
            ProblemLine(radioError ?: state.lookupProblem ?: state.engineProblem)
            if (clearance != null && state.heard) {
                Craft(clearance, state)
                SectionTitle(stringResource(R.string.clearance_your_readback))
                ReadbackLines(state, clearance, listening = state.readingBack)
                state.cleared?.takeIf { state.ready }?.let { cleared ->
                    val d = ClearanceWords.compare(planned.stops, planned.dest, cleared)
                    Mark(d.same, if (d.same) d.words else stringResource(R.string.clearance_differs, d.words))
                }
                TextButton(onClick = { transcript = !transcript }) { Text(stringResource(R.string.clearance_transcript)) }
                if (transcript) {
                    WordsField(state.text, model::type, voice)
                    OutlinedTextField(
                        value = state.readback, onValueChange = model::typeReadback, modifier = Modifier.fillMaxWidth(),
                        label = { Text(stringResource(R.string.clearance_readback_hint)) }, minLines = 2,
                    )
                    HeardLog(heardLog, model::type)
                }
            } else {
                HeardLog(heardLog, model::type)
            }
        }
    }
}

/** The clearance understood: Android's Confirm (API 30), a key tap before. */
private val UNDERSTOOD: Int get() = if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY

/** The four steps in a row: done in the go ink, the one now in the
 *  tint, the rest to come. */
@Composable
private fun Steps(steps: List<Pair<String, ClearanceModel.Step>>) {
    val ink = LocalInk.current
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        steps.forEachIndexed { i, (name, step) ->
            val said = when (step) {
                ClearanceModel.Step.DONE -> "done"
                ClearanceModel.Step.NOW -> "now"
                ClearanceModel.Step.LATER -> "to come"
            }
            Text(
                "${i + 1} $name",
                // The steps done and the one now in the brand's semibold label, those to come in its plain one.
                style = if (step == ClearanceModel.Step.LATER) MaterialTheme.typography.labelMedium else MaterialTheme.typography.labelLarge,
                color = when (step) {
                    ClearanceModel.Step.DONE -> ink.goInk
                    ClearanceModel.Step.NOW -> MaterialTheme.colorScheme.primary
                    ClearanceModel.Step.LATER -> MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.clearAndSetSemantics { contentDescription = "$name, $said" },
            )
        }
    }
}

/** The clearance's words, to type or to read as heard, and From a Photo. */
@Composable
private fun WordsField(text: String, onType: (String) -> Unit, voice: Boolean) {
    OutlinedTextField(
        value = text, onValueChange = onType, modifier = Modifier.fillMaxWidth(), minLines = 3,
        placeholder = { Text(stringResource(if (voice) R.string.clearance_words_hint_voice else R.string.clearance_words_hint)) },
    )
    ClearancePhotoRow(onUse = onType)
}

/** The clearance laid out as CRAFT, each line read whole by TalkBack. */
@Composable
private fun Craft(c: Clearance, state: ClearanceModel.State) {
    SectionTitle(stringResource(R.string.clearance_heard))
    when {
        c.read.classB -> CraftRow(stringResource(R.string.clearance_cleared_to), "Class Bravo airspace")
        c.read.limit != null -> CraftRow(
            stringResource(R.string.clearance_cleared_to),
            state.found?.limit?.let(ClearanceWords::place) ?: c.read.limit.split(" ").joinToString(" ") { w -> w.replaceFirstChar { it.uppercase() } },
        )
    }
    if (c.route.isNotEmpty() || c.read.asFiled) CraftRow(stringResource(R.string.clearance_route), ClearanceWords.route(c, state.found))
    state.altitudes?.let { CraftRow(stringResource(R.string.clearance_altitude), it) }
    ClearanceWords.frequency(c)?.let { CraftRow(stringResource(R.string.clearance_frequency), it) }
    c.read.squawk?.let { CraftRow(stringResource(R.string.clearance_transponder), it, spoken = it.toList().joinToString(" ")) }
}

@Composable
private fun CraftRow(name: String, value: String, spoken: String? = null) {
    ListItem(
        trailingContent = { Text(value, style = MaterialTheme.typography.titleMedium) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clearAndSetSemantics { contentDescription = "$name, ${spoken ?: value}" },
        content = { Text(name) },
    )
}

@Composable
private fun ReadbackLines(state: ClearanceModel.State, c: Clearance, listening: Boolean) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    when {
        state.readback.isEmpty() -> Text(stringResource(if (listening) R.string.clearance_listening_readback else R.string.clearance_readback_line), color = muted)
        else -> {
            // The pilot's own read back, the line the card is about, in
            // the emphasized title the screen's one figure takes.
            Text("“${state.readback}”", style = MaterialTheme.typography.titleLargeEmphasized)
            val check = state.check
            if (check == null) {
                Text(stringResource(R.string.clearance_readback_unchecked), color = muted)
            } else {
                ClearanceWords.readbackLines(c, check).forEach { Mark(it.ok, it.words) }
            }
        }
    }
}

/** A tick or a caution mark and its line, read as one. */
@Composable
private fun Mark(ok: Boolean, words: String) {
    val ink = LocalInk.current
    Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm), modifier = Modifier.clearAndSetSemantics { contentDescription = (if (ok) "" else "Differs: ") + words }) {
        Icon(if (ok) Icons.Filled.CheckCircle else Icons.Filled.Warning, contentDescription = null, tint = if (ok) ink.goInk else ink.cautionInk)
        Text(words, style = MaterialTheme.typography.bodyMedium)
    }
}

/** The radio as heard, newest first: a tap reads that one above. */
@Composable
private fun HeardLog(heard: List<Heard>, onPick: (String) -> Unit) {
    heard.filter { it.final }.asReversed().take(10).forEach { t ->
        ListItem(
            onClick = { onPick(t.text) },
            supportingContent = { Text(Format.clock(t.atMs), color = MaterialTheme.colorScheme.onSurfaceVariant) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            modifier = Modifier.fillMaxWidth(),
            content = { Text(t.text) },
        )
    }
}
