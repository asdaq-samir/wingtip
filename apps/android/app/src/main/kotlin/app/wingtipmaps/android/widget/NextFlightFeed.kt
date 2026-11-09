package app.wingtipmaps.android.widget

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.glance.appwidget.updateAll
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Keeps the Next Flight widget's snapshot (FlightSnapshot) as the plan
 * settles -- a route planned, changed or cleared, an airplane picked --
 * and asks the launcher to draw the widget again only when what it shows
 * has changed, as the iPhone's WidgetFeed reloads its timeline.
 */
@Composable
fun NextFlightFeed(plan: Plan) {
    val state by plan.state.collectAsStateWithLifecycle()
    val context = LocalContext.current.applicationContext
    LaunchedEffect(state.planning, state.dep, state.dest, state.stops, state.totals, state.course, state.depart, state.aircraft, state.own) {
        if (state.planning) return@LaunchedEffect
        val snapshot = FlightSnapshot.of(state, System.currentTimeMillis())
        val changed = withContext(Dispatchers.IO) { FlightSnapshot.write(context, snapshot) }
        if (changed) NextFlightWidget().updateAll(context)
    }
}
