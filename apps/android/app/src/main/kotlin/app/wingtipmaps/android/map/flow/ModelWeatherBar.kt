package app.wingtipmaps.android.map.flow

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenu
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FloatingToolbarDefaults
import androidx.compose.material3.HorizontalFloatingToolbar
import androidx.compose.material3.Icon
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderState
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Brush
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
import app.wingtipmaps.android.design.lookShape
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.flowLevels
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.LocalWingtipPalette
import app.wingtipmaps.android.ui.ProblemLine
import kotlin.math.roundToInt

/**
 * The model weather's controls over the map while a field is on (the
 * web's FlowBar, FlowLegend and FlowBubble), under the radar loop's bar:
 * Material 3 Expressive's floating toolbar with Play, the hour's slider
 * (a time scrubber, the one place a slider is right) and its hour said
 * as "Now" or "+2 h", and on the precipitation the 1h | 12h segmented
 * button; under it the legend, a card with the field's unit, its ramp, its
 * marks, the wind level's menu and whose picture it is ("AWC winds,
 * 12Z"); and the value where the pilot tapped. Pauses the timeline while
 * the app is in the background.
 */
@Composable
fun ModelWeatherBar(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val model = remember(context) { ModelWeather.of(context) }
    val state by model.state.collectAsStateWithLifecycle()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, model) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) model.away(true) else if (event == Lifecycle.Event.ON_START) model.away(false)
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    val field = state.field ?: return
    Column(
        modifier.widthIn(max = 360.dp).fillMaxWidth().padding(horizontal = WingtipSpace.Md),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
    ) {
        Timeline(state, model)
        Legend(state, field, model)
        Reading(state, field)
    }
}

@Composable
private fun Timeline(state: FlowState, model: ModelWeather) {
    HorizontalFloatingToolbar(
        expanded = true,
        shape = lookShape(RoundedCornerShape(WingtipRadius.Banner), FloatingToolbarDefaults.ContainerShape),
        modifier = Modifier.fillMaxWidth(),
    ) {
        val steps = state.steps
        IconToggleButton(checked = state.playing, onCheckedChange = { model.toggle() }, enabled = steps.size >= 2) {
            Icon(
                if (state.playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                contentDescription = stringResource(if (state.playing) R.string.flow_pause else R.string.flow_play),
            )
        }
        Column(Modifier.weight(1f).padding(vertical = WingtipSpace.Xs)) {
            when {
                state.failed -> Text(stringResource(R.string.flow_unavailable), color = LocalWingtipPalette.current.cautionInk, style = MaterialTheme.typography.bodyMedium)
                state.frames.isEmpty() || steps.isEmpty() -> Text(stringResource(R.string.flow_fetching), style = MaterialTheme.typography.bodyMedium)
                else -> {
                    val first = steps.first()
                    val last = steps.last()
                    val label = stringResource(R.string.flow_hour)
                    // A stop an hour; the slider's state follows the hour
                    // shown, which a drag seeks.
                    val scrub = remember(first, last) { SliderState(steps = maxOf(0, last - first - 1), trackRange = first.toFloat()..maxOf(first + 1, last).toFloat()) }
                    scrub.value = state.shown.coerceIn(first, last).toFloat()
                    Slider(
                        state = scrub,
                        onValueChange = { model.seek(it.roundToInt()) },
                        enabled = steps.size >= 2,
                        modifier = Modifier.fillMaxWidth().semantics { contentDescription = label },
                    )
                    val hours = FlowTimeline.hoursFromNow(state.frames, state.shown)
                    Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                        Text(
                            when {
                                hours == 0 -> stringResource(R.string.flow_now)
                                hours > 0 -> stringResource(R.string.flow_hours_ahead, hours)
                                else -> stringResource(R.string.flow_hours_back, hours)
                            },
                            fontWeight = FontWeight.SemiBold,
                            style = MaterialTheme.typography.labelMedium,
                        )
                        state.frame?.valid?.takeIf { it.length >= 16 }?.let { valid ->
                            Text("${valid.substring(11, 13)}${valid.substring(14, 16)}Z", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
            }
        }
        if (state.field == FlowKind.PRECIP) {
            SingleChoiceSegmentedButtonRow {
                FlowSpan.entries.forEachIndexed { i, span ->
                    SegmentedButton(
                        selected = state.span == span,
                        onClick = { model.pickSpan(span) },
                        shape = SegmentedButtonDefaults.itemShape(index = i, count = FlowSpan.entries.size),
                        icon = {},
                    ) {
                        Text(stringResource(if (span == FlowSpan.ONE_HOUR) R.string.flow_span_1h else R.string.flow_span_12h))
                    }
                }
            }
        }
    }
}

/** A level as the menu says it: "Surface", "Max", or the map's own way of
 *  writing a level, "FL060"; the level's feet are the engine's (flow_levels). */
@Composable
private fun levelName(id: String): String = when (id) {
    "sfc" -> stringResource(R.string.flow_surface)
    "max" -> stringResource(R.string.flow_max)
    else -> remember(id) {
        Engine.flowLevels().getOrNull()?.let { l -> (l.wind.map { it.id to it.ft } + l.icing.map { it.id to it.ft } + l.turbulence.map { it.id to it.ft }).firstOrNull { it.first == id }?.second }
            ?.let(Format::mapLevel) ?: id
    }
}

@Composable
private fun Legend(state: FlowState, field: FlowKind, model: ModelWeather) {
    val look = ModelWeatherLayer.looks?.get(field) ?: return
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(WingtipSpace.Md), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(field.title), style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                LevelMenu(state, field, model)
            }
            // The ramp, low at the start; its clear end at least a quarter
            // strong, so it still reads (the web's rampGradient).
            val bar = look.bar
            Canvas(Modifier.fillMaxWidth().height(10.dp)) {
                val stops = bar.map { s ->
                    val alpha = maxOf(s.argb ushr 24, 64)
                    FlowLooks.place(bar, s.at) to Color((alpha shl 24) or (s.argb and 0xffffff))
                }
                drawRoundRect(Brush.horizontalGradient(*stops.toTypedArray()), cornerRadius = CornerRadius(size.height / 2))
            }
            Box(Modifier.fillMaxWidth()) {
                for (tick in look.ticks) {
                    val place = FlowLooks.place(bar, tick.at)
                    Text(tick.label, style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(BiasAlignment(place * 2 - 1, 0f)))
                }
            }
            SourceLine(state)
        }
    }
}

/** Whose the picture is and when its run was made, "AWC winds, 12Z" (the
 *  owner, 2026-11-12, the web's sourceLine); the radar's for an hour past;
 *  in the caution ink once older than its source's cadence. */
@Composable
private fun SourceLine(state: FlowState) {
    if (state.radar != null) {
        Text(stringResource(R.string.flow_radar_observed), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val file = state.file ?: return
    val source = FlowTimeline.source(state.frame, file) ?: return
    val name = if (source.fallback) stringResource(R.string.flow_in_place_of_awc, source.label) else source.label
    Text(
        listOfNotNull(name, source.zulu).joinToString(", "),
        style = MaterialTheme.typography.labelSmall,
        color = if (source.stale) LocalWingtipPalette.current.cautionInk else MaterialTheme.colorScheme.onSurfaceVariant,
        fontWeight = if (source.stale) FontWeight.SemiBold else FontWeight.Normal,
    )
}

/** The level's menu, Material's exposed dropdown, for a field drawn at levels. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LevelMenu(state: FlowState, field: FlowKind, model: ModelWeather) {
    val levels = FlowTimeline.levelsOf(state.layer, field)
    val shown = state.level ?: return
    if (levels.size < 2) return
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
        TextField(
            value = levelName(shown),
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            label = { Text(stringResource(R.string.flow_level)) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = open) },
            modifier = Modifier.width(150.dp).menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for (level in levels) {
                DropdownMenuItem(
                    text = { Text(levelName(level)) },
                    onClick = {
                        open = false
                        model.pickLevel(level)
                    },
                )
            }
        }
    }
}

/** The value where the pilot tapped, in words (FlowReading). */
@Composable
private fun Reading(state: FlowState, field: FlowKind) {
    val context = LocalContext.current
    val (lat, lon) = state.point ?: return
    val grid = state.grid ?: return
    // The engine's reading at the point, then its words: a failure of
    // either is no reading, never none.
    val said = grid.valueAt(lat, lon).mapCatching { read -> read?.let { FlowReading.words(context, field, it).getOrThrow() } }
    if (said.isFailure) {
        // A rule that failed: no reading, and why, where the pilot tapped.
        Card { ProblemLine(stringResource(R.string.flow_reading_failed), Modifier.padding(horizontal = WingtipSpace.Md, vertical = WingtipSpace.Sm)) }
        return
    }
    val words = said.getOrNull() ?: stringResource(R.string.flow_no_value)
    Card {
        Row(Modifier.padding(horizontal = WingtipSpace.Md, vertical = WingtipSpace.Sm), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm), verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.flow_reading), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(WingtipSpace.Xs))
            Text(words, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        }
    }
}
