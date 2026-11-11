package app.wingtipmaps.android.ui

import androidx.activity.compose.ReportDrawnWhen
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
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
import app.wingtipmaps.android.airplane.rememberAirplaneNow
import app.wingtipmaps.android.api.AirportPin
import app.wingtipmaps.android.atc.AtcCopilotHost
import app.wingtipmaps.android.copilot.CopilotBanner
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.dryrun.DryRun
import app.wingtipmaps.android.dryrun.DryRunBar
import app.wingtipmaps.android.emergency.EmergencyModel
import app.wingtipmaps.android.emergency.EmergencyOpen
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.distanceNm
import app.wingtipmaps.android.flight.GlideRing
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.flight.OwnTrail
import app.wingtipmaps.android.flight.SpokenAlerts
import app.wingtipmaps.android.flight.StartFlightAsk
import app.wingtipmaps.android.flight.Tracking
import app.wingtipmaps.android.flight.Traffic
import app.wingtipmaps.android.map.AirportWeatherMarks
import app.wingtipmaps.android.map.AirportWeatherMode
import app.wingtipmaps.android.map.AirportWeatherStore
import app.wingtipmaps.android.map.ChartMap
import app.wingtipmaps.android.map.EmergencyLine
import app.wingtipmaps.android.map.MapLayersStore
import app.wingtipmaps.android.map.MapLoading
import app.wingtipmaps.android.map.MapMarks
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.map.MapRest
import app.wingtipmaps.android.map.MapStyle
import app.wingtipmaps.android.map.MapWeather
import app.wingtipmaps.android.map.PlatesShown
import app.wingtipmaps.android.map.RouteWorse
import app.wingtipmaps.android.map.StationLayer
import app.wingtipmaps.android.map.StationMarks
import app.wingtipmaps.android.map.TrafficDrawing
import app.wingtipmaps.android.map.WeatherAge
import app.wingtipmaps.android.map.WeatherAgeChip
import app.wingtipmaps.android.map.WeatherLoopBar
import app.wingtipmaps.android.notify.LiveFlight
import app.wingtipmaps.android.plates.PlateLookStore
import app.wingtipmaps.android.plates.PlateTagsModel
import app.wingtipmaps.android.plates.PlatesOnMap
import app.wingtipmaps.android.receiver.Receiver
import app.wingtipmaps.android.receiver.ReceiverChip
import app.wingtipmaps.android.route.RouteLegModel
import app.wingtipmaps.android.route.RoutePoints
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The map and what is over it, the same under either layout: the chart
 * with its overlays, the fields' weather, the traffic and own ship
 * (ChartMap), the loading mark until it is drawn (MapLoading), the
 * buttons at the top right where no sheet carries them, and in the air the instruments at the top
 * left (InFlightTop), or why the airplane is not shown (OwnShipNote).
 *
 * @param covered what the sheet covers at its pill, where the map opens
 *   and the loading mark turns in the middle of what is left; a sheet
 *   pulled up over the map moves neither.
 * @param onAsk the sparkle's Ask, or none (the strip's field is the way).
 * @param buttonsOnSheet whether the phone's sheet carries the map's
 *   buttons on its top edge (MapSheet's `onTop`), so none are drawn here.
 */
@Composable
fun MapPane(plan: Plan, ownShip: OwnShipControl, covered: Dp, onPick: (MapPick) -> Unit, onAsk: (() -> Unit)?, onNearest: () -> Unit, buttonsOnSheet: Boolean = false) {
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
    // The field whose card is open, ringed on the map.
    val openField = viewModel<AirportModel>().state.collectAsStateWithLifecycle().value.place?.ident
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
    val categories by mapWeather.categories.collectAsStateWithLifecycle()
    val airportWeather by remember { AirportWeatherStore.of(context) }.settings.collectAsStateWithLifecycle()
    // Each mark greyed once its METAR is older than the engine's freshness
    // (WeatherAge), looked at again each minute.
    val heardAt by mapWeather.heardAtMs.collectAsStateWithLifecycle()
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000L)
            nowMs = System.currentTimeMillis()
        }
    }
    val freshMin = remember(nowMs / 3_600_000L) { WeatherAge.freshMin(nowMs) }
    val stale = remember(heardAt, nowMs, freshMin) { WeatherAge.stale(heardAt, nowMs, freshMin) }
    val weather = remember(categories, airportWeather.mode, stale) { AirportWeatherMarks.pips(categories, airportWeather.mode, stale) }
    val fieldsWx by mapWeather.fields.collectAsStateWithLifecycle()
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
        // The miles to the map's corner, the engine's `distance_nm`; where
        // it cannot say (Engine.rule has logged why), the last kept.
        Engine.distanceNm((view.south + view.north) / 2, (view.west + view.east) / 2, view.north, view.east)
            .onSuccess { traffic.mapRadiusNm = it }
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
    // The airplane's own glide ratio (the pilot's over its book's), none
    // with no airplane or none given: no other airplane's is taken.
    val airplaneNow = rememberAirplaneNow(plan)
    val glideRatio = airplaneNow.glideRatio
    LaunchedEffect(glideRatio) { InFlight.shared.glideRatio = glideRatio }
    // The airport weather's barbs, arrows and badges (StationLayer): the
    // arrow red only past the picked airplane's demonstrated crosswind, the
    // badge at the plan's fields whose TAF is worse by the time there,
    // the alternate's among them.
    val routeWorse: RouteWorse = viewModel()
    LaunchedEffect(state.dep, state.stops, state.dest, state.depart, state.totals?.eteMin, state.totals?.alternate, airportWeather.worse) {
        if (airportWeather.worse) routeWorse.plan(state)
    }
    val worse by routeWorse.idents.collectAsStateWithLifecycle()
    val demonstratedKt = StationMarks.demonstratedKt(airplaneNow.profile)
    val kept = remember { StationMarks.Kept() }
    LaunchedEffect(fieldsWx, worse, demonstratedKt, airportWeather) {
        StationLayer.show(withContext(Dispatchers.Default) { kept.marks(fieldsWx.values, demonstratedKt, worse) }, airportWeather)
    }
    val ringKept by GlideRing.flow(context).collectAsStateWithLifecycle()
    // Each fix taken by the engine as it comes, whether the app is in
    // front or put away (the activity lives on beside own ship's
    // service), so the Live Update on the status bar (LiveFlight) goes on
    // counting down with the phone in a pocket.
    val planNow by rememberUpdatedState(state)
    LaunchedEffect(ship, ownShip.on, state.course, state.legs) {
        ship.fix.collect { taken ->
            InFlight.shared.took(if (ownShip.on) taken else null, planNow)
            LiveFlight.took(context, InFlight.shared.state.value, planNow)
        }
    }
    LaunchedEffect(ahead) { SpokenAlerts.of(context).hear(ahead) }
    // While the emergency assistant is open, the line from the airplane
    // to the field it picked (the same model EmergencyHost holds).
    val emergencyFrom by EmergencyOpen.from.collectAsStateWithLifecycle()
    val emergency by viewModel<EmergencyModel>().state.collectAsStateWithLifecycle()
    // The dry run's airplane, drawn as own ship while a run is open (DryRun).
    val dryRun by viewModel<DryRun>().state.collectAsStateWithLifecycle()
    // The approach plates on the chart, drawn as their card sets them, and
    // their fixes' tags, each approach's asked of the engine once.
    val plateState by PlatesOnMap.shared.state.collectAsStateWithLifecycle()
    val plateLook by remember { PlateLookStore.of(context) }.look.collectAsStateWithLifecycle()
    val plateTags by PlateTagsModel.shared.tags.collectAsStateWithLifecycle()
    val drawnPlates = remember(plateState, plateLook) { plateState.drawn(plateLook) }
    LaunchedEffect(drawnPlates) { PlateTagsModel.shared.want(drawnPlates.map { it.pick }) }
    val plates = remember(drawnPlates, plateLook, plateTags) { PlatesShown(drawnPlates, plateLook, PlateTagsModel.shared.drawing(drawnPlates, plateLook)) }

    val mapSaid = if (fieldsInView.isEmpty()) stringResource(R.string.said_map) else pluralStringResource(R.plurals.said_map_fields, fieldsInView.size, fieldsInView.size)
    val fieldActions = fieldsInView.map { pin ->
        CustomAccessibilityAction(stringResource(R.string.said_open_field, MapMarks.label(pin, fieldsWx[pin.ident]))) { onPick(MapPick.Airport(pin.ident)); true }
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
            ownShip = dryRun.fix ?: if (ownShip.on) fix else null,
            trail = flown,
            // Off unless the pilot keeps it on, on by itself while the
            // emergency assistant is open (GlideRing).
            glide = if (ownShip.on && GlideRing.shown(ringKept == true, emergencyFrom != null)) inFlight.glide?.ring.orEmpty() else emptyList(),
            emergency = if (emergencyFrom != null && ownShip.on) EmergencyLine.of(emergency) else null,
            selectedField = openField,
            plates = plates,
            follow = ownShip.following,
            onDragged = { ownShip.following = false },
            onRevealed = { revealed = true },
            onPick = onPick,
            onView = onView,
        )
        val problem = if (info == null) chartProblem else null
        MapLoading(shown = !revealed, bottomInset = covered, problem = problem, onRetry = charts::load, modifier = Modifier.fillMaxSize())
        // The map's part of the launch's "fully drawn" (reportFullyDrawn,
        // which the system and Macrobenchmark time a cold start to): the
        // chart shown, or its problem with Retry where it could not load.
        // The sheet's first content is the other part (Home).
        ReportDrawnWhen { revealed || problem != null }
        if (!buttonsOnSheet) {
            // Under the status bar, and clear of a cutout or a navigation
            // bar at the side in landscape (edge to edge).
            MapButtons(
                ownShip = ownShip.mode, onOwnShip = ownShip::tap, onAsk = onAsk,
                modifier = Modifier.align(Alignment.TopEnd).windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.End)),
            )
        }
        // The receiver heard: "Stratux · 12 targets · GPS"; under it the
        // radar or satellite loop's bar while one is on.
        Column(
            Modifier.align(Alignment.TopCenter).padding(top = WingtipSpace.Sm),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        ) {
            ReceiverChip()
            if (airportWeather.mode != AirportWeatherMode.OFF) WeatherAgeChip(stale, heardAt, nowMs)
            WeatherLoopBar()
            DryRunBar(rules = state.rules)
        }
        if (ownShip.on && !approximate && !denied) {
            // What is ahead and the flight's instruments, at the top left of
            // the buttons where nothing else was (#218).
            InFlightTop(state = inFlight, ahead = ahead, onNearest = onNearest, modifier = Modifier.align(Alignment.TopStart)) {
                CopilotBanner(state, flying = inFlight.underway, fix = fix, ahead = ahead)
                // The ATC copilot's card for the newest call to us.
                AtcCopilotHost(plan, flying = inFlight.underway, fix = fix)
            }
        }
        // At flying speed, the pilot asked before the position is read with
        // the screen off (the location foreground service, OwnShip).
        if (ownShip.on && !approximate && !denied) StartFlightAsk(ship)
        if (ownShip.on && (approximate || denied)) {
            // Why the airplane is not on the map, where the pilot looks
            // for it: beside the button that showed it.
            OwnShipNote(approximate = approximate, onAskAgain = ownShip::askAgain, onClose = ownShip::stop, modifier = Modifier.align(Alignment.TopStart))
        }
    }
}
