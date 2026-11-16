package app.wingtipmaps.android.ready

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableIntState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.engine.CyclePacks
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.offline.DownloadsModel
import app.wingtipmaps.android.offline.KeepForAirModel
import app.wingtipmaps.android.receiver.Receiver
import app.wingtipmaps.android.receiver.ReceiverMode
import app.wingtipmaps.android.ui.BriefModel
import app.wingtipmaps.android.ui.OwnShipControl
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Each of ready_to_fly's fixes done in place, by the feature the app
 * already has for it: the airplane picked on its one card (AirplaneCard,
 * its picker at the head), the route's charts kept as Setup → Downloads keeps a box, the
 * cycle packs kept along the route as the plan keeps them, the Brief and
 * the fields' weather asked again, the NOTAMs fetched, the plan kept, the
 * system asked for location, the receiver listened for. A fix the phone
 * has no feature for (an altitude, which the planner picks; a route,
 * where no route field is at hand) is not offered, and its row is plain
 * text.
 */
@Stable
class ReadyFixer internal constructor(
    private val plan: Plan,
    private val model: ReadyToFlyModel,
    private val brief: BriefModel,
    private val downloads: DownloadsModel,
    private val packs: CyclePacks,
    private val keeper: KeepForAirModel,
    private val receiver: Receiver,
    private val scope: CoroutineScope,
    private val askLocation: () -> Unit,
    private val onSetRoute: (() -> Unit)?,
    private val doneState: MutableIntState,
) {
    /** Bumped when a fix that changes nothing the screen watches is done
     *  (or the system has answered for location), so the facts are
     *  gathered again. */
    val done: Int get() = doneState.intValue

    fun can(fix: String?): Boolean = when (fix) {
        null, "set_altitude" -> false
        "set_route" -> onSetRoute != null
        else -> true
    }

    fun run(fix: String) {
        val state = plan.state.value
        val line = state.course?.courseLine.orEmpty().filter { it.size == 2 }
        when (fix) {
            "set_route" -> onSetRoute?.invoke()
            // The one airplane card, its picker at its head.
            "pick_airplane" -> ScreenRequests.ask(Screen.AIRPLANE)
            "download_charts" -> keepCharts(line)
            "update_packs" -> keepPacks(line)
            "refresh_weather" -> {
                brief.refresh(state)
                model.fetchFields()
            }
            "fetch_notams" -> model.fetchNotams()
            "keep_for_air" -> keepForAir()
            "save_plan" -> {
                plan.save()
                doneState.intValue++
            }
            "allow_location" -> askLocation()
            "connect_receiver" -> {
                receiver.setMode(ReceiverMode.AUTO)
                receiver.start()
                doneState.intValue++
            }
        }
    }

    /** The route's box, a tenth of a degree (6 nm) round its line as the
     *  packs are kept, as one region of Setup → Downloads: the catalog
     *  read first, for the cycle to keep it of. */
    private fun keepCharts(line: List<List<Double>>) {
        if (line.isEmpty()) return
        model.busy("download_charts", true)
        scope.launch {
            downloads.load().join()
            val lats = line.map { it[0] }
            val lons = line.map { it[1] }
            downloads.downloadBox(lons.min() - PAD_DEG, lats.min() - PAD_DEG, lons.max() + PAD_DEG, lats.max() + PAD_DEG).join()
            model.busy("download_charts", false)
            doneState.intValue++
        }
    }

    /** Keep for the Air in one tap, as the flight plan's row does it
     *  (KeepForAirModel), its charts left to their own fix; then the
     *  NOTAMs read back from what was kept, so their item has their time. */
    private fun keepForAir() {
        model.busy("keep_for_air", true)
        scope.launch {
            keeper.keep(plan).join()
            model.busy("keep_for_air", false)
            model.fetchNotams()
            doneState.intValue++
        }
    }

    /** The packs of the regions the route crosses (Plan.keepForTheAir's). */
    private fun keepPacks(line: List<List<Double>>) {
        model.busy("update_packs", true)
        scope.launch {
            val regions = withContext(Dispatchers.Default) { CyclePacks.regions(line) }
            val crossed = regions.getOrNull()
            when {
                // Said where Ready to Fly is, not kept in silence (AND-3).
                crossed == null -> model.say("The route's chart packs could not be worked out, so none were kept")
                crossed.isEmpty() -> packs.refresh()
                else -> packs.keep(crossed)
            }
            model.busy("update_packs", false)
            doneState.intValue++
        }
    }

    private companion object {
        const val PAD_DEG = 0.1
    }
}

/** The fixes for this screen; `onSetRoute` where a route can be typed
 *  from it, null where it cannot. */
@Composable
fun rememberReadyFixer(plan: Plan, onSetRoute: (() -> Unit)?, model: ReadyToFlyModel = hiltViewModel()): ReadyFixer {
    val context = LocalContext.current
    val brief: BriefModel = hiltViewModel()
    val downloads: DownloadsModel = hiltViewModel()
    val keeper: KeepForAirModel = hiltViewModel()
    val scope = rememberCoroutineScope()
    val done = remember { mutableIntStateOf(0) }
    // Whatever the system answers, the location is read again.
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { done.intValue++ }
    return remember(plan, model, onSetRoute != null) {
        ReadyFixer(
            plan, model, brief, downloads, CyclePacks.of(context), keeper, Receiver.of(context), scope,
            askLocation = { ask.launch(OwnShipControl.LOCATION) }, onSetRoute = onSetRoute, doneState = done,
        )
    }
}
