package app.wingtipmaps.android.widget

import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.updateAll
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.AppClock
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
        val snapshot = FlightSnapshot.of(state, AppClock.nowMs())
        val changed = withContext(Dispatchers.IO) { FlightSnapshot.write(context, snapshot) }
        if (changed) NextFlightWidget().updateAll(context)
    }
    // The picker's preview drawn again from the widget once a launch
    // (Android 15 and later). Android limits how often; refused, the last
    // one stays until the next launch, so the answer needs nothing more.
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return@LaunchedEffect
        val result = GlanceAppWidgetManager(context).setWidgetPreviews(NextFlightReceiver::class)
        if (result == GlanceAppWidgetManager.SET_WIDGET_PREVIEWS_RESULT_RATE_LIMITED) return@LaunchedEffect
    }
}
