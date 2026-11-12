package app.wingtipmaps.android.dryrun

import android.os.Build
import android.view.HapticFeedbackConstants
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.WbCloudy
import androidx.compose.material.icons.outlined.WbCloudy
import androidx.compose.material3.ButtonGroupDefaults
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalFloatingToolbar
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipRadius
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.lookShape
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.map.ForecastAreasLayer

/**
 * The dry run's controls over the map while one is open (DryRun), on
 * Material's horizontal floating toolbar, as a media player's are: play or
 * pause first, under the thumb, the time flown, its speed as a connected
 * group of toggle buttons (a discrete setting, decision 0017, three short
 * choices that fit side by side), forecast mode (ForecastRun) and the way
 * out at the end; with forecast mode on, its strip under them
 * (ForecastStrip). Each waypoint the run passes is felt as a segment tick.
 * The advisory areas in force at the run's time are handed to the map's
 * layer (ForecastAreasLayer).
 *
 * @param rules the plan's flight rules, "vfr" or "ifr", for the forecast.
 */
@Composable
fun DryRunBar(rules: String, modifier: Modifier = Modifier) {
    val dryRun: DryRun = hiltViewModel()
    val forecast: ForecastRun = hiltViewModel()
    val run by dryRun.state.collectAsStateWithLifecycle()
    val played by forecast.state.collectAsStateWithLifecycle()
    LaunchedEffect(run.path, played.on, rules) { forecast.follow(run.path, rules) }
    val areas = remember(played.answer, run.t) { played.answer?.let { ForecastPlay.areasAt(it, run.t) }.orEmpty() }
    LaunchedEffect(areas) { ForecastAreasLayer.show(areas) }
    DisposableEffect(Unit) { onDispose { ForecastAreasLayer.show(emptyList()) } }
    // A waypoint passed while the run plays: the nav log's row it flies
    // to moves on, and Android's segment tick marks it (API 34; a clock
    // tick before it), as a slider's steps are felt.
    val haptics = rememberHaptics()
    val row = run.path?.rowAt(run.t)
    LaunchedEffect(row) { if (run.playing && row != null && row > 0) haptics.tap(PASSED) }
    if (!run.open) return
    // Back ends the run, as its ✕ does: below any card open over it.
    BackHandler(onBack = dryRun::close)

    Column(modifier.padding(horizontal = WingtipSpace.Md), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        HorizontalFloatingToolbar(expanded = true) {
            // Material's icon buttons keep a 48 dp target round a 24 dp glyph.
            if (run.playing) {
                IconButton(onClick = dryRun::pause) { Icon(Icons.Filled.Pause, contentDescription = stringResource(R.string.dry_run_pause)) }
            } else {
                IconButton(onClick = dryRun::play) { Icon(Icons.Filled.PlayArrow, contentDescription = stringResource(R.string.dry_run_play)) }
            }
            val flown = Format.duration(run.flownS / 60)
            val flownSaid = stringResource(R.string.dry_run_flown, flown)
            Text(
                flown, style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.align(Alignment.CenterVertically).padding(end = WingtipSpace.Sm).semantics { contentDescription = flownSaid },
            )
            SpeedGroup(run.speed, dryRun::speed, Modifier.align(Alignment.CenterVertically))
            ForecastToggle(on = played.on, onToggle = forecast::toggle)
            IconButton(onClick = dryRun::close) { Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.dry_run_close)) }
        }
        if (played.on) {
            Surface(shape = lookShape(RoundedCornerShape(WingtipRadius.Banner), CardDefaults.shape), color = MaterialTheme.colorScheme.surfaceContainer, modifier = Modifier.widthIn(max = 360.dp)) {
                ForecastStrip(played, run.t, Modifier.padding(WingtipSpace.Sm))
            }
        }
    }
}

/** How many times faster than flown: the run's speeds as Material's
 *  connected toggle buttons, the one on checked. */
@Composable
private fun SpeedGroup(speed: Int, onPick: (Int) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(ButtonGroupDefaults.ConnectedSpaceBetween)) {
        DryRun.SPEEDS.forEachIndexed { i, times ->
            val said = pluralStringResource(R.plurals.dry_run_speed, times, times)
            ToggleButton(
                checked = speed == times,
                onCheckedChange = { onPick(times) },
                shapes = when (i) {
                    0 -> ButtonGroupDefaults.connectedLeadingButtonShapes()
                    DryRun.SPEEDS.lastIndex -> ButtonGroupDefaults.connectedTrailingButtonShapes()
                    else -> ButtonGroupDefaults.connectedMiddleButtonShapes()
                },
                contentPadding = PaddingValues(horizontal = WingtipSpace.Sm),
                modifier = Modifier.semantics {
                    contentDescription = said
                    role = Role.RadioButton
                },
            ) { Text(stringResource(R.string.dry_run_times, times)) }
        }
    }
}

/** Forecast mode, an icon toggle: the cloud filled while on. */
@Composable
private fun ForecastToggle(on: Boolean, onToggle: () -> Unit) {
    val state = stringResource(if (on) R.string.dry_run_forecast_on else R.string.dry_run_forecast_off)
    IconToggleButton(checked = on, onCheckedChange = { onToggle() }, modifier = Modifier.semantics { stateDescription = state }) {
        Icon(
            if (on) Icons.Filled.WbCloudy else Icons.Outlined.WbCloudy,
            contentDescription = stringResource(R.string.dry_run_forecast),
            tint = if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** A waypoint passed: SEGMENT_TICK from API 34, CLOCK_TICK before it. */
private val PASSED: Int get() = if (Build.VERSION.SDK_INT >= 34) HapticFeedbackConstants.SEGMENT_TICK else HapticFeedbackConstants.CLOCK_TICK
