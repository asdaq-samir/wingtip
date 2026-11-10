package app.wingtipmaps.android.dryrun

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipRadius
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.map.ForecastAreasLayer

/**
 * The dry run's controls over the map while one is open (DryRun): play
 * or pause, the time flown, its speed (a menu, as a discrete setting is
 * here), forecast mode (ForecastRun) and the way out; with forecast mode
 * on, its strip under them (ForecastStrip). The advisory areas in force at
 * the run's time are handed to the map's layer (ForecastAreasLayer).
 *
 * @param rules the plan's flight rules, "vfr" or "ifr", for the forecast.
 */
@Composable
fun DryRunBar(rules: String, modifier: Modifier = Modifier) {
    val dryRun: DryRun = viewModel()
    val forecast: ForecastRun = viewModel()
    val run by dryRun.state.collectAsStateWithLifecycle()
    val played by forecast.state.collectAsStateWithLifecycle()
    LaunchedEffect(run.path, played.on, rules) { forecast.follow(run.path, rules) }
    val areas = remember(played.answer, run.t) { played.answer?.let { ForecastPlay.areasAt(it, run.t) }.orEmpty() }
    LaunchedEffect(areas) { ForecastAreasLayer.show(areas) }
    DisposableEffect(Unit) { onDispose { ForecastAreasLayer.show(emptyList()) } }
    if (!run.open) return

    Surface(shape = RoundedCornerShape(WingtipRadius.Banner), tonalElevation = 3.dp, modifier = modifier.widthIn(max = 360.dp).padding(horizontal = WingtipSpace.Md)) {
        Column(Modifier.padding(horizontal = WingtipSpace.Xs, vertical = WingtipSpace.Unit / 2)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Material's icon buttons keep a 48 dp target round a 24 dp glyph.
                if (run.playing) {
                    IconButton(onClick = dryRun::pause) { Icon(Icons.Filled.Pause, contentDescription = stringResource(R.string.dry_run_pause)) }
                } else {
                    IconButton(onClick = dryRun::play) { Icon(Icons.Filled.PlayArrow, contentDescription = stringResource(R.string.dry_run_play)) }
                }
                val flown = Format.duration(run.flownS / 60)
                val flownSaid = stringResource(R.string.dry_run_flown, flown)
                Text(flown, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.semantics { contentDescription = flownSaid })
                SpeedMenu(run.speed, dryRun::speed)
                Box(Modifier.weight(1f))
                ForecastToggle(on = played.on, onToggle = forecast::toggle)
                IconButton(onClick = dryRun::close) { Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.dry_run_close)) }
            }
            if (played.on) ForecastStrip(played, run.t, Modifier.padding(horizontal = WingtipSpace.Sm).padding(bottom = WingtipSpace.Sm))
        }
    }
}

/** How many times faster than flown, a menu of the run's speeds. */
@Composable
private fun SpeedMenu(speed: Int, onPick: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val said = pluralStringResource(R.plurals.dry_run_speed, speed, speed)
    Box {
        TextButton(onClick = { open = true }, modifier = Modifier.semantics { contentDescription = said }) {
            Text(stringResource(R.string.dry_run_times, speed))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for (times in DryRun.SPEEDS) {
                DropdownMenuItem(text = { Text(stringResource(R.string.dry_run_times, times)) }, onClick = {
                    open = false
                    onPick(times)
                })
            }
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
