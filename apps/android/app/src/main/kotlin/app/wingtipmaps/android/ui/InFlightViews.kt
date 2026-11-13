package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AheadAlert
import app.wingtipmaps.android.api.nearest
import app.wingtipmaps.android.design.generated.WingtipHaptic
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.emergency.EmergencyOpen
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.AheadSheet
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.format.Spoken
import java.time.Instant
import java.util.Locale
import kotlin.math.roundToInt

/**
 * The top of the map in the air (#218), under the status bar and left of
 * the buttons: what is ahead on the track (AlertsBanner, the planner's or
 * the packs' alerts) and the flight's instruments (InstrumentsBar), where
 * nothing else was drawn. Nothing moves for them. The instruments, and the
 * fix in them, are read here rather than by the map round them, so only
 * this is drawn again at each fix; the copilot is handed them too.
 */
@Composable
fun InFlightTop(ahead: List<AheadAlert>, onNearest: () -> Unit, modifier: Modifier = Modifier, model: FlightModel = hiltViewModel(), copilot: @Composable (InFlight.State) -> Unit = {}) {
    val state by model.state.collectAsStateWithLifecycle()
    // Under the status bar and clear of a cutout or a side navigation
    // bar in landscape (edge to edge).
    Column(
        modifier
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))
            .padding(top = WingtipSpace.Sm, start = WingtipSpace.Sm, end = (WingtipSize.TapTarget + WingtipSpace.Lg)),
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
    ) {
        AlertsBanner(ahead)
        // The copilot's one message, under what is ahead (CopilotBanner).
        copilot(state)
        InstrumentsBar(state, onNearest)
        // A rule of the engine that failed for this fix, in its words.
        state.problem?.let { ProblemLine(it) }
    }
}

/**
 * What is ahead on the track, as the iOS app's and the web app's
 * AlertsBanner: the soonest in the planner's words, red where it says
 * stop or danger and amber otherwise, with the minutes and miles to it,
 * and how many more.
 */
@Composable
fun AlertsBanner(alerts: List<AheadAlert>) {
    val first = alerts.minByOrNull { it.seconds } ?: return
    val danger = first.level == "stop" || first.level == "danger"
    // Said once as each new thing comes up ahead; its minutes and miles
    // count down, so a live region would read it again every few seconds.
    AnnounceOnce(first.name + first.need, "${if (danger) "Danger" else "Caution"} ahead: ${first.name}, ${first.need}")
    // A new alert first in line is felt as it appears.
    val haptics = rememberHaptics()
    LaunchedEffect(first.name, first.level) { haptics.tap(WingtipHaptic.WARNING) }
    // A tap opens every alert ahead in full, each with its fix (AheadSheet).
    var open by rememberSaveable { mutableStateOf(false) }
    if (open) AheadSheet(alerts, onClose = { open = false })
    // Material's clickable surface, the alert's colour, opening them all.
    val showAhead = stringResource(R.string.said_show_ahead)
    Surface(
        onClick = { open = true },
        color = if (danger) LocalWingtipPalette.current.destructive else LocalWingtipPalette.current.caution,
        contentColor = Color.White,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.semantics { onClick(label = showAhead, action = null) },
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Md, vertical = WingtipSpace.Sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        ) {
            Icon(Icons.Filled.Warning, contentDescription = if (danger) "Danger ahead" else "Caution ahead")
            Column(Modifier.weight(1f)) {
                Text(first.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "${first.need} · ${InstrumentsWords.minutes(first.seconds / 60)}, ${Format.distance(first.distanceNm)}",
                    style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            if (alerts.size > 1) Text("+${alerts.size - 1}", style = MaterialTheme.typography.labelLarge)
        }
    }
}

/**
 * The flight's instruments while the airplane is at flying speed: the
 * groundspeed, track, GPS altitude and vertical speed; on the route the
 * next waypoint's distance, time and the desired track, how far off the
 * course line, and the destination's arrival; Nearest one tap away; and
 * what the figures are -- a planning aid, not for navigation. Every
 * figure is the engine's (InFlight), only the writing is here.
 */
@Composable
fun InstrumentsBar(state: InFlight.State, onNearest: () -> Unit) {
    val fix = state.fix ?: return
    if (!state.underway) return
    val progress = state.progress
    Surface(shape = MaterialTheme.shapes.large, tonalElevation = 3.dp, shadowElevation = 2.dp) {
        Column(Modifier.fillMaxWidth().padding(WingtipSpace.Md), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            Row {
                Cell("GS", Format.speed(fix.groundspeedKt), "Groundspeed", Spoken.speed(fix.groundspeedKt))
                Cell("TRK", InstrumentsWords.track(fix.trackDeg, progress?.trackMagDeg), "Track", InstrumentsWords.trackSaid(fix.trackDeg, progress?.trackMagDeg))
                Cell("ALT", fix.altitudeFt?.let { String.format(Locale.US, "%,d", it.roundToInt()) } ?: "—", "GPS altitude", Spoken.altitude(fix.altitudeFt))
                Cell("VS", InstrumentsWords.verticalSpeed(state.verticalFpm), "Vertical speed in feet a minute")
            }
            val next = progress?.next
            if (progress != null && progress.onRoute && next != null) {
                HorizontalDivider()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1.2f).semantics(mergeDescendants = true) { contentDescription = "Next, ${next.name}" }) {
                        Text("NEXT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(next.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Cell("DIS", String.format(Locale.US, if (next.distanceNm < 10) "%.1f" else "%.0f", next.distanceNm), "Distance", Spoken.distance(next.distanceNm))
                    Cell("ETE", next.eteMin?.let(InstrumentsWords::minutesSeconds) ?: "—", "Time to go", Spoken.duration(next.eteMin))
                    Cell("DTK", Format.heading(progress.desiredTrackMagDeg ?: progress.desiredTrackDeg), "Desired track", InstrumentsWords.trackSaid(progress.desiredTrackDeg, progress.desiredTrackMagDeg))
                }
                InstrumentsWords.offCourse(progress)?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                val dest = progress.destination
                if (dest?.etaS != null) {
                    Text(InstrumentsWords.arrival(dest, dest.etaS), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                // Material's tonal button: 40 dp drawn, its 48-dp touch
                // target its own, nothing grown.
                FilledTonalButton(onClick = onNearest) { Text(stringResource(R.string.nearest)) }
                // The emergency assistant's way in from flying mode, in its
                // own bar rather than a map button (decision 0010).
                TextButton(onClick = { EmergencyOpen.open(EmergencyOpen.From.FLYING) }) {
                    Text(stringResource(R.string.emergency), color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.SemiBold)
                }
                Text(
                    "Planning aid · not for navigation",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** One instrument, read as its name and its figure in words (`said`,
 *  Spoken's), the written figure where there is no spoken form. */
@Composable
private fun RowScope.Cell(name: String, value: String, spoken: String, said: String = value) {
    Column(
        Modifier.weight(1f).clearAndSetSemantics { contentDescription = "$spoken, $said" },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(name, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.titleMediumEmphasized, maxLines = if (largeType()) 2 else 1, overflow = TextOverflow.Ellipsis)
    }
}

/** The bar's writing of the engine's figures, kept apart so it is tested
 *  without a screen. */
object InstrumentsWords {
    /** The track magnetic where the engine knows the variation (a route
     *  flown), else true and marked T. */
    fun track(trueDeg: Double?, magnetic: Double?): String = when {
        magnetic != null -> Format.heading(magnetic)
        trueDeg != null -> "${Format.heading(trueDeg)}T"
        else -> "—"
    }

    /** The same track said: magnetic where it is known, else "true" as
     *  AIM 4-2-10 asks of a direction that is not magnetic. */
    fun trackSaid(trueDeg: Double?, magnetic: Double?): String = when {
        magnetic != null -> Spoken.headingMagnetic(magnetic)
        trueDeg != null -> Spoken.headingTrue(trueDeg)
        else -> Spoken.NOT_KNOWN
    }

    /** Feet a minute to the nearest ten, as a VSI is read; signed. */
    fun verticalSpeed(fpm: Double?): String {
        fpm ?: return "—"
        val r = (fpm / 10).roundToInt() * 10
        return if (r > 0) String.format(Locale.US, "+%,d", r) else String.format(Locale.US, "%,d", r)
    }

    /** Minutes as a clock counts them down, "7:05"; past an hour "1h 12m". */
    fun minutesSeconds(minutes: Double): String {
        if (minutes >= 60) return Format.duration(minutes)
        val s = (minutes * 60).roundToInt()
        return String.format(Locale.US, "%d:%02d", s / 60, s % 60)
    }

    /** Whole minutes, "12 min". */
    fun minutes(minutes: Double): String = "${minutes.roundToInt()} min"

    /** The UTC clock time a flight plan and ATC use, "1432Z". */
    fun zulu(unixS: Double): String = Format.zulu(Instant.ofEpochMilli((unixS * 1000).toLong()))

    /** How far off the course line and which side; null within a tenth. */
    fun offCourse(p: EngineContract.InFlightAnswer): String? {
        val side = p.offSide ?: return null
        if (p.offNm < 0.1) return null
        return "${Format.distance(p.offNm)} $side of course"
    }

    /** The destination's arrival and the fuel the plan leaves there. */
    fun arrival(dest: EngineContract.InFlightAnswerDestination, etaS: Double): String {
        val line = "${dest.name} at ${zulu(etaS)}, ${dest.distanceNm.roundToInt()} nm"
        return dest.fuelLeftGal?.let { "$line, about ${Format.fuel(maxOf(0.0, it))} left by the plan" } ?: line
    }
}
