package app.wingtipmaps.android.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Charts
import app.wingtipmaps.android.Links
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.flight.OwnTrail
import app.wingtipmaps.android.flight.SpokenAlerts
import app.wingtipmaps.android.map.ChartMap
import app.wingtipmaps.android.map.MapLoading
import app.wingtipmaps.android.notify.Notifications
import app.wingtipmaps.android.strip.StripLayout
import app.wingtipmaps.android.strip.StripTheme
import kotlinx.coroutines.flow.StateFlow

/** The sheet's four tabs, as the web app and the iOS app have them. */
enum class Tabs(val title: String) {
    FPL("FPL"), AIRPORT("Airport"), AIRCRAFT("Aircraft"), SETUP("Setup")
}

/**
 * The map under a sheet holding the four tabs, as Apple Maps has it and
 * the web app imitates it: Material's own bottom sheet, dragged between
 * the pill -- the figures' line and the tabs' names -- and the page.
 *
 * @param pending a link opened in the app, for the tab it is for
 *   (MainActivity); `onHandled` once it has been taken.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RootScreen(pending: StateFlow<Links.Link?>, onHandled: () -> Unit) {
    val charts: Charts = viewModel()
    val plan: Plan = viewModel()
    val session: Session = viewModel()
    val info by charts.info.collectAsStateWithLifecycle()
    val overlays by charts.overlays.collectAsStateWithLifecycle()
    val overlaysSettled by charts.overlaysSettled.collectAsStateWithLifecycle()
    val chartProblem by charts.problem.collectAsStateWithLifecycle()
    val state by plan.state.collectAsStateWithLifecycle()
    val density = LocalDensity.current.density
    val template = remember(info, density) { Charts.template(info, density) }
    val base = remember(info) { Charts.base(info) }
    // The map shown as one thing (the web's #541, #542): the loading mark
    // over it until the chart and the overlays are drawn, then faded once.
    var revealed by remember { mutableStateOf(false) }
    val night = isSystemInDarkTheme()

    var tab by rememberSaveable { mutableIntStateOf(0) }
    var airport by rememberSaveable { mutableStateOf("") }

    // The airplane on the chart (OwnShip, OwnTrail), on at the location
    // button: the system's permission dialog needs an Activity, so the
    // asks for location and for notifications are made from here, the
    // one screen, and answered back to the pieces that wanted them.
    val context = LocalContext.current
    val ownShip = remember { OwnShip.of(context) }
    val opensAt = remember { ownShip.lastPosition }
    val trail = remember { OwnTrail.of(context) }
    val fix by ownShip.fix.collectAsStateWithLifecycle()
    val approximate by ownShip.approximate.collectAsStateWithLifecycle()
    val denied by ownShip.denied.collectAsStateWithLifecycle()
    val flown by trail.points.collectAsStateWithLifecycle()
    var ownShipOn by rememberSaveable { mutableStateOf(false) }
    var following by rememberSaveable { mutableStateOf(false) }
    var asking by rememberSaveable { mutableStateOf(false) }
    // In the air (#218): each fix asked of the engine once for the
    // instruments, the strip's figures and the glide ring (InFlight), again
    // when the route changes under it; what is ahead said aloud where the
    // pilot asked (SpokenAlerts); Nearest one tap from the bar.
    val ahead by ownShip.ahead.collectAsStateWithLifecycle()
    val groundFt by ownShip.groundFt.collectAsStateWithLifecycle()
    val inFlight by InFlight.shared.state.collectAsStateWithLifecycle()
    var nearestOpen by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(groundFt) { InFlight.shared.terrainFt = groundFt }
    LaunchedEffect(fix, ownShipOn, state.course, state.legs) { InFlight.shared.took(if (ownShipOn) fix else null, state) }
    LaunchedEffect(ahead) { SpokenAlerts.of(context).hear(ahead) }
    // Location is asked precise and approximate together: Android 12 and
    // later ignore a request for precise alone, and let the pilot answer
    // with approximate, which start() reads and the note under the
    // buttons says (OwnShipNote).
    val location = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    val permissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.containsKey(Manifest.permission.ACCESS_FINE_LOCATION) && ownShipOn) {
            ownShip.start()
            following = granted[Manifest.permission.ACCESS_FINE_LOCATION] == true
        }
        if (granted.containsKey(Manifest.permission.POST_NOTIFICATIONS)) Notifications.answered()
    }
    // Back after a rotation with own ship on: the reading goes on (start
    // is idempotent), and the dot is drawn again.
    LaunchedEffect(ownShipOn) { if (ownShipOn) ownShip.start() }
    // Back from Settings with the permission changed: read again, so the
    // note under the buttons goes once precise is allowed, and the reading
    // stops if it was taken away.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { if (ownShipOn) ownShip.start() }
    // A watch set or traffic near asked for notifications (Notifications
    // .allow): the system's dialog on Android 13 and later, nothing to ask
    // before it.
    val notificationsWanted by Notifications.wanted.collectAsStateWithLifecycle()
    LaunchedEffect(notificationsWanted) {
        if (!notificationsWanted) return@LaunchedEffect
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !Notifications.allowed(context)) {
            permissions.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
        } else {
            Notifications.answered()
        }
    }
    // The location button as Apple Maps' is: off, then following, then
    // let go; a drag of the map lets go too.
    val ownShipMode = when {
        !ownShipOn -> OwnShipMode.OFF
        following -> OwnShipMode.FOLLOWING
        else -> OwnShipMode.READING
    }
    val onOwnShip = {
        when {
            !ownShipOn -> {
                ownShipOn = true
                if (ownShip.permitted) {
                    ownShip.start()
                    following = true
                } else {
                    permissions.launch(location)
                }
            }
            !following -> following = true
            else -> {
                following = false
                ownShipOn = false
                ownShip.stop()
            }
        }
    }

    val link by pending.collectAsStateWithLifecycle()
    LaunchedEffect(link) {
        when (val opened = link) {
            null -> return@LaunchedEffect
            is Links.Place -> {
                airport = opened.ident
                tab = Tabs.AIRPORT.ordinal
            }
            is Links.Route -> {
                plan.plan(opened.dep, opened.dest, opened.stops)
                tab = Tabs.FPL.ordinal
            }
            is Links.SignIn -> {}
        }
        onHandled()
    }

    // The sheet sits over the navigation bar (edge to edge): its pill is
    // the strip and the tabs above the bar, and its content ends above it.
    val navigationBar = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val sheetPeek = 120.dp + navigationBar
    val pixels = LocalDensity.current
    // The map and its buttons, the same under either layout. `covered` is
    // what the sheet covers when it rests at its peek, where the map
    // opens and the loading mark turns in the middle of what is left; a
    // sheet pulled up over the map moves neither.
    val mapContent: @Composable (onAsk: (() -> Unit)?, covered: Dp) -> Unit = { onAsk, covered ->
        Box(Modifier.fillMaxSize()) {
            ChartMap(
                // The first style waits for the overlays' name (at most
                // Charts.FIRST_STYLE_WAIT_MS), so they are in it with the chart.
                template = if (overlaysSettled) template else null,
                minZoom = base?.minZoom ?: 5,
                maxZoom = base?.maxZoom ?: 12,
                line = state.course?.courseLine.orEmpty(),
                modifier = Modifier.fillMaxSize(),
                overlays = overlays,
                night = night,
                bottomInset = with(pixels) { covered.roundToPx() },
                opensAt = opensAt,
                ownShip = if (ownShipOn) fix else null,
                trail = flown,
                glide = if (ownShipOn) inFlight.glide?.ring.orEmpty() else emptyList(),
                follow = following,
                onDragged = { following = false },
                onRevealed = { revealed = true },
            )
            MapLoading(
                shown = !revealed,
                bottomInset = covered,
                problem = if (info == null) chartProblem else null,
                modifier = Modifier.fillMaxSize(),
            )
            MapButtons(ownShip = ownShipMode, onOwnShip = onOwnShip, onAsk = onAsk, modifier = Modifier.align(Alignment.TopEnd))
            // What is ahead and the flight's instruments, at the top left of
            // the buttons where nothing else was (#218).
            if (ownShipOn && !approximate && !denied) {
                InFlightTop(
                    state = inFlight,
                    ahead = ahead,
                    onNearest = { nearestOpen = true },
                    modifier = Modifier.align(Alignment.TopStart),
                )
            }
            // Why the airplane is not on the map, where the pilot looks
            // for it: beside the button that showed it.
            if (ownShipOn && (approximate || denied)) {
                OwnShipNote(
                    approximate = approximate,
                    onAskAgain = { permissions.launch(location) },
                    onClose = {
                        ownShipOn = false
                        following = false
                        ownShip.stop()
                    },
                    modifier = Modifier.align(Alignment.TopStart),
                )
            }
        }
    }
    // Nearest, from the instruments bar: a field tapped opens its card in
    // the Airport tab.
    if (nearestOpen) {
        NearestSheet(
            fix = fix,
            onOpen = { ident ->
                airport = ident
                tab = Tabs.AIRPORT.ordinal
                nearestOpen = false
            },
            onClose = { nearestOpen = false },
        )
    }
    // The strip (the other session's StripLayout: one field, the flight
    // as one strip, the owner's pick of 2026-11-04), tried beside the
    // tabs: Setup's Screen row switches (LayoutPreference). In the air,
    // own ship at flying speed, the strip turns to the airplane.
    val layout by rememberLayout()
    if (layout == LayoutPreference.STRIP) {
        val flying = ownShipOn && OwnShip.underway(fix?.groundspeedKt)
        StripTheme {
            StripLayout(plan = plan, session = session, ownShip = ownShip, flying = flying, map = { mapContent(null, 0.dp) })
        }
        return
    }
    BottomSheetScaffold(
        scaffoldState = rememberBottomSheetScaffoldState(),
        sheetPeekHeight = sheetPeek,
        sheetContent = {
            Column(Modifier.fillMaxWidth().fillMaxHeight(0.9f)) {
                FiguresStrip(state)
                TabRow(selectedTabIndex = tab) {
                    Tabs.entries.forEachIndexed { i, t ->
                        Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t.title) })
                    }
                }
                Box(Modifier.weight(1f)) {
                    when (Tabs.entries[tab]) {
                        Tabs.FPL -> FPLScreen(plan)
                        Tabs.AIRPORT -> AirportScreen(airport)
                        Tabs.AIRCRAFT -> AircraftScreen(plan)
                        Tabs.SETUP -> SetupScreen(session)
                    }
                }
                Spacer(Modifier.height(navigationBar))
            }
        },
    ) {
        mapContent({ asking = true }, sheetPeek)
    }
    // Ask (AskScreen): a question about the flight put to the assistant,
    // as a modal sheet over the map and the tabs, opened at the sparkle
    // button; the whole height, since a conversation wants the room.
    if (asking) {
        ModalBottomSheet(
            onDismissRequest = { asking = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        ) {
            AskScreen(plan = plan, session = session, ownShip = ownShip, onClose = { asking = false })
        }
    }
}
