package app.wingtipmaps.android.altitude

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.ui.LocalWingtipPalette
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * The Profile card (the owner's spec of 2026-11-10, after ForeFlight's
 * profile view): the route from the side (ProfileChart) with the altitude
 * slider beside it (AltitudeSlider), the previewed altitude's clearance in
 * the engine's words under it, and a waypoint's altitude, Start At or
 * Cross At, in a sheet from a tap on it (LegAltitudeSheet). A card on the
 * sheet's stack like every page (the card rule), opened from the plan's
 * Profile row or by typing "profile" in the search.
 */
@Composable
fun ProfileCard(plan: Plan, exit: CardExit, flight: FlightModel = hiltViewModel()) {
    val state by plan.state.collectAsStateWithLifecycle()
    val altitudes by PlanAltitudes.state.collectAsStateWithLifecycle()
    val model: ProfileModel = hiltViewModel()
    val shown by model.state.collectAsStateWithLifecycle()
    val inFlight by flight.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.dep, state.dest, state.stops) { model.load(state) }
    var tapped by remember { mutableStateOf<ProfileModel.Waypoint?>(null) }
    val flown = ProfileModel.flown(state, altitudes)
    val steps = remember(altitudes.line, flown) { ProfileModel.steps(altitudes, flown) }
    val legal = altitudes.line?.altitudeFigures.orEmpty().map { it.altitudeFt }

    CardPage(title = stringResource(R.string.profile_card), exit = exit) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            item(key = "side") {
                val profile = shown.profile
                if (profile == null) {
                    ProblemLine(shown.problem ?: stringResource(R.string.profile_needs_route).takeIf { !state.routed }, Modifier.padding(horizontal = WingtipSpace.Lg))
                    return@item
                }
                val line = remember(state.course, state.legs, profile) { ProfileModel.line(state, profile.lengthNm) }
                val waypoints = remember(state.legs, profile) { ProfileModel.waypoints(state, profile.lengthNm) }
                val at = shown.previewFt ?: flown
                val clearance = remember(profile, at, waypoints) { at?.let { AltitudeEngine.clearance(profile, it, waypoints) } }
                Row(Modifier.fillMaxWidth().height(WingtipSize.TapTarget * 6).padding(horizontal = WingtipSpace.Lg), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                    ProfileChart(
                        profile, line, waypoints, shown.previewFt, clearance?.getOrNull(), steps.maxOrNull() ?: 0.0,
                        onWaypoint = { tapped = it },
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                    AltitudeSlider(
                        steps = steps,
                        flownFt = flown,
                        previewFt = shown.previewFt,
                        clearance = clearance?.getOrNull(),
                        airplaneFt = inFlight.fix?.altitudeFt?.takeIf { inFlight.underway },
                        onPreview = model::preview,
                        onSet = { ft ->
                            // Set: the plan flies it, a legal row at each leg's nearest as the Advisor's (warn, never limit).
                            PlanAltitudes.nearest(ft in legal)
                            plan.setAltitude(ft)
                            model.preview(null)
                        },
                        modifier = Modifier.fillMaxHeight(),
                    )
                }
                clearance?.fold(
                    { c ->
                        val colour = when (c.level) {
                            "red" -> MaterialTheme.colorScheme.error
                            "yellow" -> LocalWingtipPalette.current.cautionInk
                            else -> Color.Unspecified
                        }
                        // Read as it changes, so TalkBack hears the clearance off the slider too.
                        Text(
                            c.words, color = colour, style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(horizontal = WingtipSpace.Lg).testTag("profile-clearance").semantics { liveRegion = LiveRegionMode.Polite },
                        )
                    },
                    { why -> ProblemLine(why.message, Modifier.padding(horizontal = WingtipSpace.Lg)) },
                )
            }
        }
    }

    tapped?.let { w ->
        LegAltitudeSheet(
            waypoint = w,
            airplane = altitudes.line?.aircraft,
            steps = steps,
            set = altitudes.points.firstOrNull { it.ident == w.ident },
            onSet = { p ->
                PlanAltitudes.set(p)
                plan.plan()
                tapped = null
            },
            onClear = {
                PlanAltitudes.remove(w.ident)
                plan.plan()
                tapped = null
            },
            onClose = { tapped = null },
        )
    }
}
