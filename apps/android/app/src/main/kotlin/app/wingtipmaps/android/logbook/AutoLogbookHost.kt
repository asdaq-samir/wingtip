package app.wingtipmaps.android.logbook

import android.net.ConnectivityManager
import android.net.Network
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.plan.FlightChoices

/**
 * Where a recorded flight, once it has ended, is offered for the logbook
 * (the web's AutoLogbookHost): the model reads the track all along, and
 * the sheet is drawn only while a draft or what was logged is open.
 */
@Composable
fun AutoLogbookHost(plan: Plan, session: Session) {
    val context = LocalContext.current
    val model = hiltViewModel<LogbookDraftModel, LogbookDraftModel.Factory> { it.create(FlightRecorder.of(context), UnsentTracks.of(context)) }
    // A logged flight's track not yet sent goes when the app is in front
    // with a network: on each return to the front, and as a network comes
    // while it is (ConnectivityManager's default-network callback).
    LifecycleResumeEffect(model) {
        model.sendUnsent()
        val connectivity = context.getSystemService(ConnectivityManager::class.java)
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = model.sendUnsent()
        }
        // Refused (too many callbacks in the app): the next return to the
        // front sends it instead.
        val registered = try {
            connectivity?.registerDefaultNetworkCallback(callback)
            connectivity != null
        } catch (e: RuntimeException) {
            false
        }
        onPauseOrDispose { if (registered) connectivity.unregisterNetworkCallback(callback) }
    }
    val pilot by session.pilot.collectAsStateWithLifecycle()
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    val planned by plan.state.collectAsStateWithLifecycle()
    LaunchedEffect(pilot, tail, planned.aircraft) { model.context(signedIn = pilot != null, tail = tail, type = planned.aircraft) }
    val state by model.state.collectAsStateWithLifecycle()
    if (state.open) FlightLoggedSheet(state, model)
}
