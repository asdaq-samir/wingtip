package app.wingtipmaps.android.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Charts
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AirportPin
import app.wingtipmaps.android.atc.AtcCopilotHost
import app.wingtipmaps.android.copilot.CopilotBanner
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.emergency.EmergencyModel
import app.wingtipmaps.android.emergency.EmergencyOpen
import app.wingtipmaps.android.flight.AirplaneGlide
import app.wingtipmaps.android.flight.Geo
import app.wingtipmaps.android.flight.GlideRing
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.flight.OwnTrail
import app.wingtipmaps.android.flight.SpokenAlerts
import app.wingtipmaps.android.flight.Tracking
import app.wingtipmaps.android.flight.Traffic
import app.wingtipmaps.android.map.ChartMap
import app.wingtipmaps.android.map.EmergencyLine
import app.wingtipmaps.android.map.MapLayersStore
import app.wingtipmaps.android.map.MapLoading
import app.wingtipmaps.android.map.MapMarks
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.map.MapRest
import app.wingtipmaps.android.map.MapStyle
import app.wingtipmaps.android.map.MapWeather
import app.wingtipmaps.android.map.TrafficDrawing
import app.wingtipmaps.android.receiver.Receiver
import app.wingtipmaps.android.receiver.ReceiverChip
import app.wingtipmaps.android.route.RouteLegModel
import app.wingtipmaps.android.route.RoutePoints
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * The map and what is over it, the same under either layout: the chart
 * with its overlays, the fields' weather, the traffic and own ship
 * (ChartMap), the loading mark until it is drawn (MapLoading), the
 * buttons at the top right, and in the air the instruments at the top
 * left (InFlightTop), or why the airplane is not shown (OwnShipNote).
 *
 * @param covered what the sheet covers at its pill, where the map opens
 *   and the loading mark turns in the middle of what is left; a sheet
 *   pulled up over the map moves neither.
 * @param onAsk the sparkle's Ask, or none (the strip's field is the way).
 */
@Composable
fun MapPane(plan: Plan, ownShip: OwnShipControl, covered: Dp, onPick: (MapPick) -> Unit, onAsk: (() -> Unit)?, onNearest: () -> Unit) {
    val charts: Charts = viewModel()
    val info by charts.info.collectAsStateWithLifecycle()
    val overlays by charts.overlays.collectAsStateWithLifecycle()
    val overlaysSettled by charts.overlaysSettled.collectAsStateWithLifecycle()
    val chartProblem by charts.problem.collectAsStateWithLifecycle()
    val closeTiles by charts.closeTiles.collectAsStateWithLifecycle()
    val state by plan.state.collectAsStateWithLifecycle()
    // The route's points, where its line is cut into legs, and the leg
    // whose sheet is open (RouteLegModel), cased in green.
    val routePoints = remember(state.course) { RoutePoints.of(state.course) }
    val selectedLeg by viewModel<RouteLegModel>().selected.collectAsStateWithLifecycle()
    val density = LocalDensity.current
    val template = remember(info, density.density) { Charts.template(info, density.density) }
    val base = remember(info) { Charts.base(info) }
    val terminal = remember(info, density.density) { Charts.terminal(info, density.density) }
    // The map shown as one thing (the web's #541, #542): the loading mark
    // over it until the chart and the overlays are drawn, then faded once.
    var revealed by remember { mutableStateOf(false) }
    val night = isSystemInDarkTheme()
    val context = LocalContext.current
    val layers by remember { MapLayersStore.of(context) }.layers.collectAsStateWithLifecycle()
    val mapWeather: MapWeather = viewModel()
    val weather by mapWeather.colours.collectAsStateWithLifecycle()
    val traffic = remember { Traffic.of(context) }
    val trafficOn by traffic.on.collectAsStateWithLifecycle()
    val planes by traffic.planes.collectAsStateWithLifecycle()
    val marks by traffic.marks.collectAsStateWithLifecycle()
    val heardAtMs by traffic.heardAtMs.collectAsStateWithLifecycle()
    val tracked by remember { Tracking.of(context) }.hex.collectAsStateWithLifecycle()
    val targets = remember(planes, marks, heardAtMs) {
        val heard = heardAtMs ?: System.currentTimeMillis()
        planes.mapIndexed { i, p -> TrafficDrawing.Target(p, marks.getOrNull(i), heard - ((p.seenS ?: 0.0) * 1000).toLong()) }
    }
    // The cockpit's ADS-B receiver, listened for from the first map on
    // (Receiver: once a second while its setting is Auto).
    LaunchedEffect(Unit) { Receiver.of(context).start() }
    // Asked every five seconds while the map is shown and traffic is on.
    DisposableEffect(trafficOn) {
        if (trafficOn) traffic.start()
        onDispose { traffic.stop() }
    }
    // The fields in view as actions on the map, with a screen reader on
    // (MapMarks): the chart's symbols are pictures TalkBack cannot read.
    var fieldsInView by remember { mutableStateOf<List<AirportPin>>(emptyList()) }
    val scope = rememberCoroutineScope()
    var marksJob by remember { mutableStateOf<Job?>(null) }
    val onView = { view: MapRest ->
        if (A11y.screenReader(context)) {
            marksJob?.cancel()
            marksJob = scope.launch { fieldsInView = MapMarks.fieldsInView(context, view) }
        }
        mapWeather.view(view)
        traffic.mapCentre = (view.south + view.north) / 2 to (view.west + view.east) / 2
        traffic.mapRadiusNm = Geo.nm((view.south + view.north) / 2, (view.west + view.east) / 2, view.north, view.east)
        // The street map's session asked for only once the map is near
        // where it comes in, as the web asks it (BaseGl CloseBase).
        if (view.zoom >= MapStyle.CLOSE_FROM - 1) charts.wantClose()
    }

    val ship = ownShip.ownShip
    val opensAt = remember { ship.lastPosition }
    val trail = remember { OwnTrail.of(context) }
    val fix by ship.fix.collectAsStateWithLifecycle()
    val approximate by ship.approximate.collectAsStateWithLifecycle()
    val denied by ship.denied.collectAsStateWithLifecycle()
    val flown by trail.points.collectAsStateWithLifecycle()
    // In the air (#218): each fix asked of the engine once for the
    // instruments, the strip's figures and the glide ring (InFlight), again
    // when the route changes under it; what is ahead said aloud where the
    // pilot asked (SpokenAlerts).
    val ahead by ship.ahead.collectAsStateWithLifecycle()
    val groundFt by ship.groundFt.collectAsStateWithLifecycle()
    val inFlight by InFlight.shared.state.collectAsStateWithLifecycle()
    LaunchedEffect(groundFt) { InFlight.shared.terrainFt = groundFt }
    // The picked airplane's own glide, none with no airplane (AirplaneGlide).
    LaunchedEffect(state.aircraft) { InFlight.shared.glideRatio = AirplaneGlide.ratio(state.aircraft) }
    val ringKept by GlideRing.flow(context).collectAsStateWithLifecycle()
    LaunchedEffect(fix, ownShip.on, state.course, state.legs) { InFlight.shared.took(if (ownShip.on) fix else null, state) }
    LaunchedEffect(ahead) { SpokenAlerts.of(context).hear(ahead) }
    // While the emergency assistant is open, the line from the airplane
    // to the field it picked (the same model EmergencyHost holds).
    val emergencyFrom by EmergencyOpen.from.collectAsStateWithLifecycle()
    val emergency by viewModel<EmergencyModel>().state.collectAsStateWithLifecycle()

    val mapSaid = if (fieldsInView.isEmpty()) stringResource(R.string.said_map) else pluralStringResource(R.plurals.said_map_fields, fieldsInView.size, fieldsInView.size)
    val fieldActions = fieldsInView.map { pin ->
        CustomAccessibilityAction(stringResource(R.string.said_open_field, MapMarks.label(pin))) { onPick(MapPick.Airport(pin.ident)); true }
    }
    Box(Modifier.fillMaxSize()) {
        ChartMap(
            // The first style waits for the overlays' name (at most
            // Charts.FIRST_STYLE_WAIT_MS), so they are in it with the chart.
            template = if (overlaysSettled) template else null,
            minZoom = base?.minZoom ?: 5,
            maxZoom = base?.maxZoom ?: 12,
            line = state.course?.courseLine.orEmpty(),
            modifier = Modifier.fillMaxSize().semantics {
                contentDescription = mapSaid
                customActions = fieldActions
            },
            routePoints = routePoints,
            selectedLeg = selectedLeg,
            overlays = overlays,
            layers = layers,
            terminal = terminal,
            weather = weather,
            closeTiles = closeTiles,
            traffic = if (trafficOn) targets else emptyList(),
            tracked = tracked,
            night = night,
            bottomInset = with(density) { covered.roundToPx() },
            opensAt = opensAt,
            ownShip = if (ownShip.on) fix else null,
            trail = flown,
            // Off unless the pilot keeps it on, on by itself while the
            // emergency assistant is open (GlideRing).
            glide = if (ownShip.on && GlideRing.shown(ringKept == true, emergencyFrom != null)) inFlight.glide?.ring.orEmpty() else emptyList(),
            emergency = if (emergencyFrom != null && ownShip.on) EmergencyLine.of(emergency) else null,
            follow = ownShip.following,
            onDragged = { ownShip.following = false },
            onRevealed = { revealed = true },
            onPick = onPick,
            onView = onView,
        )
        MapLoading(shown = !revealed, bottomInset = covered, problem = if (info == null) chartProblem else null, modifier = Modifier.fillMaxSize())
        MapButtons(ownShip = ownShip.mode, onOwnShip = ownShip::tap, onAsk = onAsk, modifier = Modifier.align(Alignment.TopEnd))
        // The receiver heard: "Stratux · 12 targets · GPS".
        ReceiverChip(Modifier.align(Alignment.TopCenter).padding(top = WingtipSpace.Sm))
        if (ownShip.on && !approximate && !denied) {
            // What is ahead and the flight's instruments, at the top left of
            // the buttons where nothing else was (#218).
            InFlightTop(state = inFlight, ahead = ahead, onNearest = onNearest, modifier = Modifier.align(Alignment.TopStart)) {
                CopilotBanner(state, flying = inFlight.underway, fix = fix, ahead = ahead)
                // The ATC copilot's card for the newest call to us.
                AtcCopilotHost(plan, flying = inFlight.underway, fix = fix)
            }
        }
        if (ownShip.on && (approximate || denied)) {
            // Why the airplane is not on the map, where the pilot looks
            // for it: beside the button that showed it.
            OwnShipNote(approximate = approximate, onAskAgain = ownShip::askAgain, onClose = ownShip::stop, modifier = Modifier.align(Alignment.TopStart))
        }
    }
}
