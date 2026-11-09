package app.wingtipmaps.android.atc

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
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
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipHaptic
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.ui.LocalInk

/** Whether the microphone may be used: what the copilot listens with. */
fun micAllowed(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

/**
 * The ATC copilot over the map, under the copilot's banner while the pilot
 * has it on (the web's AtcCopilot): the newest call to us as its card;
 * flying with no registration, a line saying so; flying without the
 * microphone allowed, or not listening, a line and a tap to start. The
 * microphone is asked for in the moment it is needed, as Android's
 * guidance has it, never at launch.
 */
@Composable
fun AtcCopilotHost(plan: Plan, flying: Boolean, fix: OwnShip.Fix?) {
    val context = LocalContext.current
    val mode by remember(context) { AtcSetting.of(context) }.mode.collectAsStateWithLifecycle()
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    val model = viewModel { AtcCopilotModel(RadioListener.of(context)) }
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
    }
}

/** One line over the map, with the tap that answers it where there is one. */
@Composable
private fun StatusLine(words: String, button: String?, caution: Boolean = false, onTap: () -> Unit) {
    Surface(shape = MaterialTheme.shapes.large, tonalElevation = 3.dp, shadowElevation = 2.dp) {
        Row(
            Modifier.padding(start = WingtipSpace.Md, end = WingtipSpace.Xs, top = WingtipSpace.Xs, bottom = WingtipSpace.Xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        ) {
            Icon(Icons.Filled.Mic, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text(
                words, Modifier.weight(1f, fill = false), style = MaterialTheme.typography.bodyMedium,
                color = if (caution) LocalInk.current.cautionInk else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (button != null) FilledTonalButton(onClick = onTap) { Text(button) }
        }
    }
}
