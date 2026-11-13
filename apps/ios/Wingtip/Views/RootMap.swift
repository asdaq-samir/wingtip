import CoreLocation
import SwiftUI

/// The chart map with its buttons, banners and chips, under the iPhone's
/// sheet or beside the iPad's sidebar (RootView). A view of its own, so
/// what it reads at every fix -- own ship's height, the dry run, the
/// traffic -- runs this body alone and leaves the root's, with its sheet,
/// as it was.
struct RootMap: View {
    let layout: RootLayout
    /// The height of the map the sheet covers.
    let inset: CGFloat
    @Binding var mapShown: Bool
    let search: OneSearchModel
    let open: (String) -> Void
    let ask: (String?) -> Void
    @Environment(Replay.self) private var replay
    @Environment(Emergency.self) private var emergency
    @Environment(Navigator.self) private var nav
    @Environment(Charts.self) private var charts
    /// The flight (FlightSession), its parts read where they are drawn.
    @Environment(FlightSession.self) private var flight
    @Environment(\.undoManager) private var undoManager
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage("layout") private var layoutName = "plan"
    @State private var following = false
    @State private var routeAway = false
    @State private var fitRequest = 0
    // Setup's map switches (MapExtrasInput.Keys).
    @AppStorage(MapExtrasInput.Keys.waypoints) private var waypointsOn = false
    @AppStorage(MapExtrasInput.Keys.classB) private var classBOn = false
    @AppStorage(MapExtrasInput.Keys.plates) private var platesOn = true
    // The plate card's look (PlateLook.Keys), kept on the device.
    @AppStorage(PlateLook.Keys.opacity) private var plateOpacity = PlateLook.defaultOpacity
    @AppStorage(PlateLook.Keys.inverted) private var plateInverted = false
    @AppStorage(PlateLook.Keys.annotations) private var plateAnnotations = true

    private var plan: Plan { flight.plan }
    private var ownShip: OwnShip { flight.ownShip }
    private var dryRun: DryRun { flight.dryRun }
    private var traffic: Traffic { flight.traffic }
    private var tracking: Tracking { flight.tracking }

    /// What the map draws of the airplane tracked and the flights flown,
    /// and its taps for them: an airplane's card, a point pressed.
    private var flightLayer: FlightLayer {
        return FlightLayer(
            trackedHex: tracking.hex, tracked: tracking.latest, follow: tracking.follow,
            path: tracking.path, past: tracking.past, flown: tracking.flown,
            glide: flight.inFlight.glide?.coordinates ?? [],
            emergency: emergency.line(from: dryRun.fix ?? ownShip.fix),
            onTraffic: { plane in
                tracking.track(plane.hex, plane: plane)
                nav.open(.traffic(plane.hex.lowercased()))
            },
            onDragged: { tracking.follow = false })
    }

    var body: some View {
        ChartMap(
            template: charts.template, minZoom: charts.base?.minZoom ?? 5, maxZoom: charts.base?.maxZoom ?? 12,
            course: plan.course, checkpoints: plan.checkpoints,
            procedurePaths: plan.legs.compactMap { $0.procedure?.path.compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil } },
            // A flown track's replay, else the dry run: the same airplane.
            simulated: replay.fix ?? dryRun.fix,
            traffic: traffic.on ? traffic.planes : [],
            ownFt: (dryRun.fix ?? ownShip.fix)?.altitudeFt,
            onRegion: { centre, radius in traffic.mapCentre = centre; traffic.mapRadiusNm = radius },
            // A field tapped on the chart opens its card, half way up, as
            // the web app does.
            onAirport: { ident in open(ident) },
            following: $following, routeAway: $routeAway, fitRequest: fitRequest,
            flight: flightLayer,
            extras: MapExtrasInput(
                held: nav.heldRoute.flatMap { AirportRoute($0).heldPoint },
                selectedField: nav.heldRoute.flatMap { AirportRoute($0).field },
                waypoints: waypointsOn, classB: classBOn, plates: platesOn, approaches: plan.procedures,
                hiddenPlates: HiddenPlates.shared.keys,
                plateLook: PlateLook(opacity: plateOpacity, inverted: plateInverted, annotations: plateAnnotations),
                // A plate's page tapped: its card, half way up, as a field's.
                onPlate: { key in nav.open(.plate(key)) },
                // A finger held on the chart: the airspace there, half way
                // up, as a field's card opens.
                onHold: { at in open(AirportRoute.airspace(lat: at.latitude, lon: at.longitude).text) },
                onWaypoint: plan.course != nil ? { (ident: String, at: CLLocationCoordinate2D, action: CardAction) in
                    plan.drop(ident, at: at, then: action == .directTo ? .direct : .add, from: action == .directTo ? dryRun.fix ?? ownShip.fix : nil)
                    // Direct To and Add to Route land on FPL, as a card's
                    // Fly Here does, the sheet at the size it was left.
                    search.close()
                    nav.showPlan()
                } : nil),
            // A tap on the course opens its nearest leg's card, that leg
            // cased in green while it is in sight (RouteLegView).
            routeLegs: RouteLegInput(
                legs: plan.course != nil ? RouteLegModel.mapLegs(plan) : [],
                selected: { if case .leg(let index) = nav.top { return index }; return nil }(),
                onSelect: { index in nav.open(.leg(index)) }),
            // The route's fields worse by the flight's time there, and the
            // airplane's demonstrated crosswind for the wind barbs' red.
            fieldWeather: FieldWeatherInput(
                worse: FieldWeatherMarks.worse(plan.briefing, fields: Set([plan.dep, plan.dest] + plan.stops).subtracting([""])),
                alternates: flight.alternate.atEta,
                demonstratedKt: FieldWeatherMarks.demonstratedKt(plan)),
            hazardLegs: plan.hazardLegs,
            bottomInset: inset,
            onReveal: {
                Metrics.shared.mapShown() // Instruments' launch-to-map interval ends.
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.15)) { mapShown = true }
            })
            .ignoresSafeArea()
            // A plate hidden from its card comes back when its approach is
            // picked again.
            .onChange(of: plan.procedures.map(PlateKey.of)) { before, now in HiddenPlates.shared.picked(now, before: before) }
            // Over the map, under its buttons, until it shows: Wingtip's mark
            // turning where the map opens.
            .overlay {
                if !mapShown {
                    MapLoading(bottom: inset).transition(.opacity)
                }
            }
            .overlay(alignment: .topTrailing) {
                // Over the sheet's top on the iPhone, at the top right beside
                // the iPad's sidebar. In the strip the field is the way to the
                // assistant, so the sparkle is not drawn.
                MapButtonsDock(overSheet: layout == .sheet, following: $following,
                               routeAway: routeAway && plan.course != nil, fitRoute: { fitRequest += 1 },
                               ask: layoutName == "strip" ? nil : { ask(nil) })
            }
            .overlay(alignment: .top) {
                VStack(spacing: WingtipSpace.sm) {
                    AlertsBanner(alerts: ownShip.ahead)
                    // The in-flight copilot's one message, under what is ahead.
                    CopilotBanner()
                    // The radio, while the app listens or a call to us waits.
                    RadioOverlay()
                    // The flight's instruments, at flying speed (#218).
                    InstrumentsBar()
                    // The radar or satellite loop's bar while one is on.
                    WeatherLoopBar()
                    // The model weather's timeline while it is on, and under it
                    // its close, field menu and legend at the left (ModelWeather).
                    ModelWeatherBar()
                    ModelWeatherLegend()
                }
                // Clear of the map's buttons down the right where they stand
                // at the top (the iPad's): a button and the gutters round it.
                // Over the iPhone's sheet they ride its top, so the banners
                // have the width.
                .padding(.trailing, layout == .split ? WingtipSize.mapButton + WingtipSpace.md * 2 : 0)
            }
            .overlay(alignment: .topLeading) {
                VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                    if dryRun.fix != nil { DryRunControls() }
                    WatchBanner()
                    // The cockpit's ADS-B receiver heard, then the licence's
                    // credit beside the internet's traffic it covers.
                    ReceiverChip()
                    if traffic.credited { MapChip(Traffic.credit(traffic.source)) }
                    // The USGS's credit while its imagery shows close in (CloseImagery).
                    if CloseImagery.shared.drawn { MapChip(CloseImageryOverlay.credit) }
                    if traffic.on, let problem = traffic.marksProblem { MapChip(problem, colour: WingtipInk.caution) }
                }
                .padding(.leading, WingtipSpace.md).padding(.top, WingtipSpace.md)
            }
            // The flight's own work while the map is up (FlightLoops).
            .modifier(FlightLoops())
            // The window's UndoManager for the route's history: shake to undo
            // and the Edit menu (PlanHistory).
            .onAppear { plan.undoManager = undoManager }
            .onChange(of: undoManager) { _, manager in plan.undoManager = manager }
            // Siri listens for the fields the shortcuts' airport entity
            // suggests (the kept route's: AirportEntityQuery.suggestedEntities),
            // and Spotlight finds them, so both are told again when the route
            // changes (AirportSpotlight).
            .onAppear { AirportSpotlight.refresh() }
            .onChange(of: plan.idents) { _, _ in AirportSpotlight.refresh() }
    }
}
