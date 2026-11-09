package app.wingtipmaps.android.map

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipRadius
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.offline.KeptAgeLine
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.ui.LocalWingtipPalette
import kotlinx.coroutines.delay
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlin.math.roundToInt

/** A frame's time as the bar writes it: Zulu, this phone's clock and zone, its age, and whether it is old. */
data class FrameTime(val zulu: String, val local: String, val age: String, val old: Boolean) {
    companion object {
        private val ZULU = DateTimeFormatter.ofPattern("HHmm'Z'").withZone(ZoneOffset.UTC)

        fun of(frame: app.wingtipmaps.android.api.generated.LoopFrame, now: Instant, oldAfterS: Double): FrameTime? {
            val at = runCatching { Instant.parse(frame.valid) }.getOrNull() ?: return null
            val minutes = Duration.between(at, now).toMinutes()
            val zone = ZoneId.systemDefault()
            val local = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withZone(zone).format(at) + " " +
                DateTimeFormatter.ofPattern("zzz").withZone(zone).format(at)
            val age = if (minutes < 1) "just now" else "${Format.duration(minutes.toDouble())} ago"
            return FrameTime(ZULU.format(at), local, age, Duration.between(at, now).seconds > oldAfterS)
        }
    }
}

/**
 * The loop's bar over the map, under the receiver's chip, only while a
 * loop is on: play or pause, the scrubber -- a time scrubber is the one
 * place a slider is right, the owner's rule for discrete settings aside
 * -- and the frame's time in Zulu and on this phone's clock, with its
 * age, said plainly as old once past the source's own pace. Fetching and
 * failing are said here, where the loop is. Pauses the loop while the
 * app is in the background.
 */
@Composable
fun WeatherLoopBar(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val loop = remember(context) { WeatherLoop.of(context) }
    val state by loop.state.collectAsStateWithLifecycle()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, loop) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) loop.away(true) else if (event == Lifecycle.Event.ON_START) loop.away(false)
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            now = System.currentTimeMillis()
        }
    }
    if (state.kind == LoopKind.OFF) return
    val name = state.kind.label
    val time = state.frame?.let { FrameTime.of(it, Instant.ofEpochMilli(now), state.oldAfterS) }
    val caution = LocalWingtipPalette.current.cautionInk
    Surface(shape = RoundedCornerShape(WingtipRadius.Banner), tonalElevation = 3.dp, modifier = modifier.widthIn(max = 360.dp).padding(horizontal = WingtipSpace.Md)) {
        Row(Modifier.padding(end = WingtipSpace.Md), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
            val playLabel = stringResource(if (state.playing) R.string.loop_pause else R.string.loop_play)
            IconButton(onClick = loop::toggle, enabled = state.frames.size >= 2) {
                Icon(if (state.playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = playLabel)
            }
            Column(Modifier.weight(1f).padding(vertical = WingtipSpace.Xs)) {
                when {
                    state.failed -> Text(stringResource(R.string.loop_unavailable, name), color = caution, style = MaterialTheme.typography.bodyMedium)
                    state.frames.isEmpty() -> Text(stringResource(R.string.loop_fetching, name.lowercase()), style = MaterialTheme.typography.bodyMedium)
                    else -> {
                        val frameLabel = stringResource(R.string.loop_frame, name)
                        // A stop per frame; the slider's state follows the
                        // loop's frame, which a drag seeks.
                        val steps = maxOf(0, state.frames.size - 2)
                        val range = 0f..maxOf(1, state.frames.lastIndex).toFloat()
                        val scrub = remember(steps, range) { SliderState(steps = steps, trackRange = range) }
                        scrub.value = state.shown.coerceAtLeast(0).toFloat()
                        Slider(
                            state = scrub,
                            onValueChange = { loop.seek(it.roundToInt()) },
                            enabled = state.ready,
                            modifier = Modifier.fillMaxWidth().semantics { contentDescription = frameLabel },
                        )
                        if (time != null) {
                            Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                                Text(time.zulu, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelMedium)
                                Text(time.local, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium, maxLines = 1)
                                Spacer(Modifier.weight(1f))
                                Text(
                                    if (time.old) stringResource(R.string.loop_old, time.age) else time.age,
                                    color = if (time.old) caution else MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontWeight = if (time.old) FontWeight.SemiBold else FontWeight.Normal,
                                    style = MaterialTheme.typography.labelMedium,
                                )
                            }
                        }
                        // The frames kept for the air, shown with no signal: how
                        // old the list is (each frame's own age is above).
                        KeptAgeLine(KeptForAir.WEATHER_LOOP, state.keptAtMs)
                    }
                }
            }
        }
    }
}

/**
 * The loop's two menus in Setup's Map section (Android's map menu):
 * which loop, and, with one on, how fast it plays. Menus, as discrete
 * settings are here, not sliders.
 */
@Composable
fun WeatherLoopRows() {
    val context = LocalContext.current
    val loop = remember(context) { WeatherLoop.of(context) }
    val state by loop.state.collectAsStateWithLifecycle()
    MenuRow(stringResource(R.string.loop_kind), state.kind.label, LoopKind.entries.map { it.label to { loop.pick(it) } })
    if (state.kind != LoopKind.OFF) {
        MenuRow(stringResource(R.string.loop_speed), state.speed.label, LoopSpeed.entries.map { it.label to { loop.speed(it) } })
    }
}

/** A setting of a few choices as a row with its value, a menu under it. */
@Composable
private fun MenuRow(title: String, value: String, choices: List<Pair<String, () -> Unit>>) {
    var open by remember { mutableStateOf(false) }
    ListItem(
        trailingContent = {
            Box {
                TextButton(onClick = { open = true }) { Text(value) }
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                    for ((label, pick) in choices) {
                        DropdownMenuItem(text = { Text(label) }, onClick = {
                            open = false
                            pick()
                        })
                    }
                }
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth(),
        content = { Text(title) },
    )
}
