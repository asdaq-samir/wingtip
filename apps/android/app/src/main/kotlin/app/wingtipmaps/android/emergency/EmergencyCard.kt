package app.wingtipmaps.android.emergency

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
import app.wingtipmaps.android.ui.sheet.CardExit

/**
 * The emergency assistant's card on the sheet's stack (SheetPage.Emergency,
 * opened through EmergencyOpen): its model follows own ship and asks the
 * planner only while the card is up, so shut it costs nothing. With own
 * ship off it offers to show the position, which the fields are worked out
 * from. Back and ✕ are the stack's, as every card's (SheetPagesHost).
 */
@Composable
fun EmergencyCard(plan: Plan, ownShip: OwnShipControl, exit: CardExit, model: EmergencyModel = hiltViewModel(), airplanes: AirplaneModel = hiltViewModel(), flight: FlightModel = hiltViewModel()) {
    val from by EmergencyOpen.from.collectAsStateWithLifecycle()
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
        state, model, exit, onShowPosition = { if (!ownShip.on) ownShip.tap() },
        askGlide = { AskFigures(now, "glide") },
    ) {
        // The Airplane page's own picker, here so the emergency stays open.
        val types by airplanes.profiles.collectAsStateWithLifecycle()
        AirplanePicker(types, selected = planned.aircraft, onPick = plan::setAircraft)
    }
}
