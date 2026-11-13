package app.wingtipmaps.android.emergency

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.airplane.AirplaneNow
import app.wingtipmaps.android.airplane.AskFigures
import app.wingtipmaps.android.airplane.rememberAirplaneNow
import app.wingtipmaps.android.checklist.ChecklistKind
import app.wingtipmaps.android.checklist.ChecklistStore
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.ui.AirplaneModel
import app.wingtipmaps.android.ui.AirplanePicker
import app.wingtipmaps.android.ui.OwnShipControl

/**
 * Where the emergency assistant opens over the page, and only while it is
 * open (EmergencyOpen): its model follows own ship and asks the planner,
 * so shut it costs nothing. With own ship off it offers to show the
 * position, which the fields are worked out from. Back closes it: the
 * dialog's own Back, and the activity's (a Back that reaches the screen
 * under it, as the nightly CardRuleTest's does), which otherwise went to
 * the sheet and left the assistant open over it.
 */
@Composable
fun EmergencyHost(plan: Plan, ownShip: OwnShipControl, model: EmergencyModel = hiltViewModel(), airplanes: AirplaneModel = hiltViewModel(), flight: FlightModel = hiltViewModel()) {
    val from by EmergencyOpen.from.collectAsStateWithLifecycle()
    if (from == null) return
    BackHandler(onBack = EmergencyOpen::close)
    val context = LocalContext.current
    val planned by plan.state.collectAsStateWithLifecycle()
    val fix by ownShip.ownShip.fix.collectAsStateWithLifecycle()
    val inFlight by flight.state.collectAsStateWithLifecycle()
    val state by model.state.collectAsStateWithLifecycle()
    // No airplane chosen: no glide is guessed (decision 0011). An own
    // airplane of no stock type glides at its pilot's ratio alone.
    val now = rememberAirplaneNow(plan)
    val airplane = AirplaneNow.plannerName(planned.aircraft, planned.own)
    LaunchedEffect(from, airplane, now.glideRatio) {
        val text = planned.aircraft.ifEmpty { null }?.let { ChecklistStore.of(context).text(it, ChecklistKind.EMERGENCY) }.orEmpty()
        model.start(airplane, planned.aircraft.ifEmpty { null }?.uppercase() ?: now.name, callsign = null, checklist = text, glideRatio = now.glideRatio)
    }
    // The airplane's track magnetic, the engine's, where it flies a route.
    LaunchedEffect(fix, ownShip.on) { model.took(if (ownShip.on) fix else null, inFlight.progress?.trackMagDeg) }
    EmergencySheet(
        state, model, onShowPosition = { if (!ownShip.on) ownShip.tap() }, onClose = EmergencyOpen::close,
        askGlide = { AskFigures(now, "glide") },
    ) {
        // The Airplane page's own picker, here so the emergency stays open.
        val types by airplanes.profiles.collectAsStateWithLifecycle()
        AirplanePicker(types, selected = planned.aircraft, onPick = plan::setAircraft)
    }
}
