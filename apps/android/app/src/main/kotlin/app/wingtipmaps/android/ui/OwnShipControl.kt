package app.wingtipmaps.android.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.notify.Notifications

/**
 * The airplane on the chart, on at the position button: whether it is on,
 * whether the map follows it, and the system's asks for location and for
 * notifications, which need an Activity and so are made from the one
 * screen and answered back to the pieces that wanted them.
 */
@Stable
class OwnShipControl internal constructor(
    val ownShip: OwnShip,
    on: MutableState<Boolean>,
    following: MutableState<Boolean>,
    private val ask: (Array<String>) -> Unit,
) {
    var on by on
        private set
    var following by following

    val mode: OwnShipMode get() = when {
        !on -> OwnShipMode.OFF
        following -> OwnShipMode.FOLLOWING
        else -> OwnShipMode.READING
    }

    /** The button as Apple Maps' and Google Maps' are: off, then
     *  following, then off again; a drag of the map lets go. */
    fun tap() {
        when {
            !on -> {
                on = true
                if (ownShip.permitted) {
                    ownShip.start()
                    following = true
                } else {
                    ask(LOCATION)
                }
            }
            !following -> following = true
            else -> stop()
        }
    }

    fun askAgain() = ask(LOCATION)

    fun stop() {
        following = false
        on = false
        ownShip.stop()
    }

    internal companion object {
        /** Precise and approximate together: Android 12 and later ignore a
         *  request for precise alone, and let the pilot answer with
         *  approximate, which start() reads and OwnShipNote says. */
        val LOCATION = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    }
}

@Composable
fun rememberOwnShipControl(flight: FlightModel = hiltViewModel()): OwnShipControl {
    val context = LocalContext.current
    val ownShip = flight.ownShip
    val on = rememberSaveable { mutableStateOf(false) }
    val following = rememberSaveable { mutableStateOf(false) }
    val permissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.containsKey(Manifest.permission.ACCESS_FINE_LOCATION) && on.value) {
            ownShip.start()
            following.value = granted[Manifest.permission.ACCESS_FINE_LOCATION] == true
        }
        if (granted.containsKey(Manifest.permission.POST_NOTIFICATIONS)) Notifications.answered()
    }
    // Back after a rotation with own ship on: the reading goes on (start
    // is idempotent), and the dot is drawn again. Back from Settings with
    // the permission changed: read again, so the note goes once precise is
    // allowed, and the reading stops if it was taken away.
    LaunchedEffect(on.value) { if (on.value) ownShip.start() }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { if (on.value) ownShip.start() }
    // A watch set or traffic near asked for notifications (Notifications
    // .allow): the system's dialog on Android 13 and later.
    val notificationsWanted by Notifications.wanted.collectAsStateWithLifecycle()
    LaunchedEffect(notificationsWanted) {
        if (!notificationsWanted) return@LaunchedEffect
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !Notifications.allowed(context)) {
            permissions.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
        } else {
            Notifications.answered()
        }
    }
    return remember(ownShip) { OwnShipControl(ownShip, on, following) { permissions.launch(it) } }
}
