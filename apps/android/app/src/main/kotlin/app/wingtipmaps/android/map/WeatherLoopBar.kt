package app.wingtipmaps.android.map

import android.os.Build
import android.view.HapticFeedbackConstants
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material3.FloatingToolbarDefaults
import androidx.compose.material3.HorizontalFloatingToolbar
import androidx.compose.material3.Icon
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
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
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipRadius
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.lookShape
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.offline.KeptAgeLine
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.ui.LocalWingtipPalette
import app.wingtipmaps.android.ui.MenuSettingRow
import app.wingtipmaps.android.ui.SettingsGroup
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
 * loop is on, as Material's floating toolbar: play or pause, the scrubber -- a time scrubber is the one
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
    val now by AppClock.ticking(30_000L)
    if (state.kind == LoopKind.OFF) return
    val name = state.kind.label
    val time = state.frame?.let { FrameTime.of(it, Instant.ofEpochMilli(now), state.oldAfterS) }
    val caution = LocalWingtipPalette.current.cautionInk
    val haptics = rememberHaptics()
    // Material 3 Expressive's floating toolbar, in the banner's capsule:
    // Play at its start under the thumb, then the stepped scrubber and the
    // frame's time, as Pixel Weather's map keeps its timeline at the foot.
    HorizontalFloatingToolbar(
        expanded = true,
        shape = lookShape(RoundedCornerShape(WingtipRadius.Banner), FloatingToolbarDefaults.ContainerShape),
        modifier = modifier.widthIn(max = 360.dp).fillMaxWidth().padding(horizontal = WingtipSpace.Md),
    ) {
        val playLabel = stringResource(if (state.playing) R.string.loop_pause else R.string.loop_play)
        IconToggleButton(checked = state.playing, onCheckedChange = { loop.toggle() }, enabled = state.frames.size >= 2) {
            Icon(if (state.playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = playLabel)
        }
        Column(Modifier.weight(1f).padding(vertical = WingtipSpace.Xs)) {
            when {
                state.failed -> Text(stringResource(R.string.loop_unavailable, name), color = caution, style = MaterialTheme.typography.bodyMedium)
                state.frames.isEmpty() -> Text(stringResource(R.string.loop_fetching, name.lowercase()), style = MaterialTheme.typography.bodyMedium)
                else -> {
                    val frameLabel = stringResource(R.string.loop_frame, name)
                    // A stop per frame; the slider's state follows the
                    // loop's frame, which a drag seeks. Time is a continuous
                    // scrub, so a slider is right here (decision 0017 is for
                    // discrete settings).
                    val steps = maxOf(0, state.frames.size - 2)
                    val range = 0f..maxOf(1, state.frames.lastIndex).toFloat()
                    val scrub = remember(steps, range) { SliderState(steps = steps, trackRange = range) }
                    scrub.value = state.shown.coerceAtLeast(0).toFloat()
                    Slider(
                        state = scrub,
                        onValueChange = {
                            val to = it.roundToInt()
                            // Each frame crossed is felt, as Android's own
                            // stepped sliders tick (SEGMENT_TICK, API 34).
                            if (to != state.shown) haptics.tap(FrameTick)
                            loop.seek(to)
                        },
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

/** A frame crossed on the scrubber: Android's segment tick from API 34,
 *  the clock tick below that. */
private val FrameTick: Int
    get() = if (Build.VERSION.SDK_INT >= 34) HapticFeedbackConstants.SEGMENT_TICK else HapticFeedbackConstants.CLOCK_TICK

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
    // One group, the loop and its speed, as the map's switches below it
    // are grouped (the sheet audit's B-1).
    val count = if (state.kind != LoopKind.OFF) 2 else 1
    SettingsGroup {
        MenuSettingRow(stringResource(R.string.loop_kind), state.kind.label, LoopKind.entries.map { it.label to { loop.pick(it) } }, index = 0, count = count)
        if (state.kind != LoopKind.OFF) {
            MenuSettingRow(stringResource(R.string.loop_speed), state.speed.label, LoopSpeed.entries.map { it.label to { loop.speed(it) } }, index = 1, count = count)
        }
    }
}
