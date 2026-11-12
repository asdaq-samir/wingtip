package app.wingtipmaps.android.atc

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalFloatingToolbar
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipHaptic
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.ui.LocalInk
import app.wingtipmaps.android.ui.WingtipIcons

/** Whether the microphone may be used: what the copilot listens with. */
fun micAllowed(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

/**
 * The ATC copilot over the map, under the copilot's banner while the pilot
 * has it on (the web's AtcCopilot): the newest call to us as its card;
 * flying with no registration, a line saying so; flying without the
 * microphone allowed, or not listening, a line and a tap to start; while
 * it listens, a capsule on Material's floating toolbar -- Material's
 * loading indicator and "Listening to the radio…" until words come, then
 * the radio's mark and "Heard: " with them -- and its Stop. The radio's
 * own look and words, never the mic's, which is Ask by voice's
 * (voice/VoiceInput; the owner, 2026-11-10). The microphone is asked for in the moment it is needed, as Android's
 * guidance has it, never at launch.
 */
@Composable
fun AtcCopilotHost(plan: Plan, flying: Boolean, fix: OwnShip.Fix?) {
    val context = LocalContext.current
    val mode by remember(context) { AtcSetting.of(context) }.mode.collectAsStateWithLifecycle()
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    val model = hiltViewModel<AtcCopilotModel, AtcCopilotModel.Factory> { it.create(RadioListener.of(context)) }
    var allowed by remember { mutableStateOf(micAllowed(context)) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { allowed = it }
    // Allowed from Setup meanwhile: read again as the flight or the mode changes.
    LaunchedEffect(mode, flying) { allowed = micAllowed(context) }
    LaunchedEffect(mode, flying, tail, allowed) { model.follow(mode, flying && allowed && RadioListener.canListen(context), tail) }
    val state by model.state.collectAsStateWithLifecycle()
    val listening by model.listening.collectAsStateWithLifecycle()
    val error by model.error.collectAsStateWithLifecycle()
    // Heard on the phone or not offered at all (RadioListener.canListen).
    val voice = remember(context) { RadioListener.canListen(context) }
    if (mode == AtcMode.OFF || !voice) return
    val card = state.card
    val noPosition = stringResource(R.string.atc_direct_needs_position)
    val haptics = rememberHaptics()
    // Back puts the ATC card away, as its close does.
    BackHandler(enabled = card != null, onBack = model::dismiss)
    when {
        card != null -> AtcCardView(
            card, state.kept, state.problem,
            words = { AtcWords.itemWords(it, EngineAtc::altitude) },
            onAct = { i ->
                model.act(i) { ident ->
                    fix?.let {
                        plan.directTo(ident, it)
                        haptics.tap(WingtipHaptic.DIRECT_TO)
                        null
                    } ?: noPosition
                }
            },
            onReadBack = {
                if (allowed) model.readBack() else ask.launch(Manifest.permission.RECORD_AUDIO)
            },
            onClose = model::dismiss,
        )
        !flying -> {}
        tail == null -> StatusLine(stringResource(R.string.atc_no_tail), button = null) {}
        !allowed -> StatusLine(stringResource(R.string.atc_allow_mic), stringResource(R.string.atc_allow)) { ask.launch(Manifest.permission.RECORD_AUDIO) }
        !listening -> StatusLine(error ?: stringResource(R.string.atc_not_listening), stringResource(R.string.atc_listen), caution = error != null, onTap = model::listen)
        else -> {
            val heard by model.heard.collectAsStateWithLifecycle()
            ListeningCapsule(words = heard.lastOrNull()?.text, onStop = model::stop)
        }
    }
}

/** Listening to the radio: the stock loading indicator and "Listening to
 *  the radio…", or the radio's mark and the words now heard, and Stop at
 *  the end, on Material's floating toolbar over the map. */
@Composable
private fun ListeningCapsule(words: String?, onStop: () -> Unit) {
    HorizontalFloatingToolbar(expanded = true) {
        val at = Modifier.align(Alignment.CenterVertically)
        if (words == null) {
            Loading(at.size(CapsuleMark), description = stringResource(R.string.atc_listening))
        } else {
            Icon(WingtipIcons.radio, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = at)
        }
        Text(
            words?.let { stringResource(R.string.atc_heard, it) } ?: stringResource(R.string.atc_listening),
            Modifier.align(Alignment.CenterVertically).padding(horizontal = WingtipSpace.Sm).widthIn(max = CapsuleWords).semantics { liveRegion = LiveRegionMode.Polite },
            style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        IconButton(onClick = onStop) { Icon(Icons.Filled.Stop, contentDescription = stringResource(R.string.atc_stop_listening)) }
    }
}

/** The widest the heard words run before they are cut, so the capsule
 *  stays a capsule over the map at a phone's width. */
private val CapsuleWords = 220.dp

/** The indicator's size in the capsule, an icon's. */
private val CapsuleMark = 24.dp

/** One line over the map, with the tap that answers it where there is one. */
@Composable
private fun StatusLine(words: String, button: String?, caution: Boolean = false, onTap: () -> Unit) {
    Surface(shape = MaterialTheme.shapes.large, tonalElevation = 3.dp, shadowElevation = 2.dp) {
        Row(
            Modifier.padding(start = WingtipSpace.Md, end = WingtipSpace.Xs, top = WingtipSpace.Xs, bottom = WingtipSpace.Xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        ) {
            Icon(WingtipIcons.radio, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text(
                words, Modifier.weight(1f, fill = false), style = MaterialTheme.typography.bodyMedium,
                color = if (caution) LocalInk.current.cautionInk else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (button != null) FilledTonalButton(onClick = onTap) { Text(button) }
        }
    }
}
