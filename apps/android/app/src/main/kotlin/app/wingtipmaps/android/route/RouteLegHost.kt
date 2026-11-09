package app.wingtipmaps.android.route

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.flight.OwnShip

/**
 * Where the Route Leg sheet opens over the map, and only while a leg is
 * picked (RouteLegModel): Direct flies from the airplane where it is
 * shown, else from the departure, to the leg's end (Plan.directToStop),
 * or cancels a Direct already flown; Remove takes a stop out. Each closes
 * the sheet, so the route is seen being planned again.
 */
@Composable
fun RouteLegHost(plan: Plan, ownShipOn: Boolean, model: RouteLegModel = viewModel()) {
    val selected by model.selected.collectAsStateWithLifecycle()
    val index = selected ?: return
    val state by plan.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val fix by remember { OwnShip.of(context) }.fix.collectAsStateWithLifecycle()
    val inFlight by InFlight.shared.state.collectAsStateWithLifecycle()
    // The point flying mode flies to: the engine's next waypoint on the route.
    val flyingTo = inFlight.progress?.takeIf { ownShipOn && it.onRoute }?.next?.name
    val leg = RouteLegModel.view(index, state, flyingTo)
    if (leg == null) {
        // The route was planned again without this leg: the sheet goes.
        LaunchedEffect(index) { model.close() }
        return
    }
    RouteLegSheet(
        leg = leg,
        onDirect = {
            if (leg.directOn) plan.cancelDirect() else plan.directToStop(leg.to, if (ownShipOn) fix else null)
            model.close()
        },
        onRemove = {
            plan.removeStop(leg.to)
            model.close()
        },
        onClose = model::close,
    )
}
