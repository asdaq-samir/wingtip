import CoreLocation
import SwiftUI
import UIKit

/// The map under a sheet with three sizes -- the pill, half and full, as
/// Apple Maps has them and as the web app imitates them -- holding the
/// plan under the one search (PlanSheet; the owner's one-search design,
/// 2026-11-09, in the tabs' place). The system's own sheet, so the drag,
/// the detents and the glass are iOS's, not a copy.
struct RootView: View {
    @Environment(Charts.self) var charts
    @Environment(Session.self) var session
    @Environment(Plan.self) var plan
    @Environment(OwnShip.self) var ownShip
    @Environment(DryRun.self) var dryRun
    @Environment(Traffic.self) var traffic
    @Environment(Verdict.self) var verdict
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(\.undoManager) private var undoManager
    @State var detent: PresentationDetent = .half
    @State private var sheetUp = true
    /// The card and the pages in it (Navigator): the pages a scene was on
    /// come back with it (SceneStorage), as Apple restores state, so a
    /// restored scene lands where the pilot left it. A launch argument's
    /// screen (`-screen airport`, for CI's pictures and the UI tests) wins.
    @SceneStorage("pages") private var scenePages: String?
    var nav: Navigator { .shared }
    /// The one search, the sheet's (OneSearchModel): kept here, so a link,
    /// Siri and the map can bring it up.
    @State var search = OneSearchModel()
    /// The screen's layout, as the web app's Screen row has it: the plan
    /// under the one search, or the strip (StripSheetView: the flight as
    /// one strip under the same search; the owner's pick of 2026-11-04).
    /// The same key as the web's preference; a `-layout strip` launch
    /// argument sets it for CI's pictures.
    @AppStorage("layout") var layoutName = "plan"
    @State private var following = false
    @State private var routeAway = false
    @State private var fitRequest = 0
    /// Whether the map has shown (ChartMap's reveal): the loading mark is
    /// over it until then.
    @State private var mapShown = false
    /// The height the sheet covers at the foot of the screen, until the
    /// map shows: only the map's opening point and the loading mark over
    /// it read it (ChartMap.Coordinator.open, MapLoading), and neither
    /// does once the map is in. Not written after that, so a drag of the
    /// sheet, a new height each frame, does not run this body and the
    /// whole map's update again each frame.
    @State private var sheetHeight: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// What Siri or a Shortcut asked for (the App Intents), done here once
    /// the app is on the screen: the owner's ask, 2026-11-03, Siri and
    /// Shortcuts through App Intents.
    @State private var pending = PendingCommand.shared
    // Setup's map switches (MapExtrasInput.Keys).
    @AppStorage(MapExtrasInput.Keys.waypoints) private var waypointsOn = false
    @AppStorage(MapExtrasInput.Keys.classB) private var classBOn = false
    @AppStorage(MapExtrasInput.Keys.plates) private var platesOn = true
    // The plate card's look (PlateLook.Keys), kept on the device.
    @AppStorage(PlateLook.Keys.opacity) private var plateOpacity = PlateLook.defaultOpacity
    @AppStorage(PlateLook.Keys.inverted) private var plateInverted = false
    @AppStorage(PlateLook.Keys.annotations) private var plateAnnotations = true

    /// What the map draws of the airplane tracked and the flights flown,
    /// and its taps for them: an airplane's card, a point pressed.
    private var flightLayer: FlightLayer {
        let tracking = Tracking.shared
        return FlightLayer(
            trackedHex: tracking.hex, tracked: tracking.latest, follow: tracking.follow,
            path: tracking.path, past: tracking.past, flown: tracking.flown,
            glide: InFlight.shared.glide?.coordinates ?? [],
            emergency: Emergency.shared.line(from: dryRun.fix ?? ownShip.fix),
            onTraffic: { plane in
                Tracking.shared.track(plane.hex, plane: plane)
                Navigator.shared.open(.traffic(plane.hex.lowercased()))
            },
            onDragged: { Tracking.shared.follow = false })
    }

    /// The sheet's lowest size, the pill: the page dots and the page's
    /// first row (the search's on Search, the route's on FPL), as Maps'
    /// pill is its search row; 132 points for the row, the dots' row over it.
    static let pill = PresentationDetent.height(132 + PageDots.row)

    var layout: RootLayout { .of(sizeClass, verticalSizeClass) }

    var body: some View {
        Group {
            switch layout {
            case .sheet:
                map
                    .sheet(isPresented: $sheetUp) {
                        Group {
                            if layoutName == "strip" {
                                StripSheetView(detent: $detent, opened: Bindable(nav).planPath, search: search)
                            } else {
                                PlanSheet(search: search, openScreen: { openScreen($0) }, ask: { ask($0) })
                            }
                        }
                        // How much of the map the sheet covers, for the map's
                        // opening point and the loading mark over it, until
                        // the map shows (sheetHeight).
                        .onGeometryChange(for: CGFloat.self) { $0.size.height + $0.safeAreaInsets.bottom } action: { height in
                            if !mapShown { sheetHeight = height }
                            // The map's buttons ride its top (MapButtonsDock),
                            // read there alone, so this body is not run again.
                            SheetEdge.shared.plan = height
                        }
                        .environment(\.sheetAtPill, detent == RootView.pill)
                        .presentationDetents([RootView.pill, .half, .large], selection: $detent)
                        .presentationBackgroundInteraction(.enabled(upThrough: .half))
                        // The system's Liquid Glass sheet and its own corners
                        // on iOS 26; the material on iOS 18 (Design/Glass.swift).
                        .sheetGlass()
                        .interactiveDismissDisabled()
                        // The system sheet settles at its detents with its own
                        // feel; no tap of ours is added to a stock part (the
                        // owner, 2026-11-10).
                    }
            case .split:
                SplitLayout(map: map, search: search, openScreen: { openScreen($0) }, ask: { ask($0) })
                    // No sheet over the iPad's layout: its alerts and the
                    // emergency assistant from the root itself.
                    .modifier(TopHosts(active: true))
            }
        }
        // Ready to Fly given the app's models, for a start from anywhere.
        .modifier(ReadyToFlyHost())
        // The welcome, a shared flight, the flight just logged and the
        // clearance, each a card when its model asks (CardTriggers).
        .modifier(CardTriggers())
        .onChange(of: layout, initial: true) { _, now in nav.split = now == .split }
        // The scene's pages kept and brought back (SceneStorage); a launch
        // argument's screen (CI's pictures, the UI tests) wins over them.
        .onAppear {
            nav.split = layout == .split
            let arguments = CommandLine.arguments
            if let at = arguments.firstIndex(of: "-layout"), at + 1 < arguments.count { layoutName = arguments[at + 1] }
            if let at = arguments.firstIndex(of: "-screen"), at + 1 < arguments.count, let screen = Screen(rawValue: arguments[at + 1]) {
                openScreen(screen)
            } else if let at = arguments.firstIndex(of: "-card"), at + 1 < arguments.count, let page = SheetPage(stored: arguments[at + 1]) {
                // A card as a scene keeps it (`-card @KOSH`, `-card +map`),
                // for the card rule's UI tests (CardRuleTests).
                nav.open(page)
            } else {
                nav.restore(SheetPage.restore(scenePages))
            }
        }
        .onChange(of: nav.stored) { _, now in scenePages = SheetPage.store(now) }
        // The search up, the sheet up with it, clear of the keyboard.
        .onChange(of: search.presented) { _, up in if up, layout == .sheet, detent != .large { detent = .large } }
        // The picked look's tint, the brand's blue by default (Look).
        .lookTint()
        // The key actions' taps, none with Reduce Motion on (Feel).
        .modifier(FeelHost())
        // ⌘F, ⌘B and ⌘L with a hardware keyboard (KeyboardShortcuts).
        .modifier(KeyboardShortcuts(search: { search.presented = true }, open: { openScreen($0) }))
    }

    /// A field or a point opened from the map: its card over the plan,
    /// half way up, on the iPhone (a field tapped after another takes its
    /// place rather than piling up); in the inspector on the iPad.
    func open(_ route: String) {
        search.close()
        if layout == .sheet, layoutName == "strip" {
            // The strip pushes its cards on its own stack (StripSheetView).
            nav.planPath.append(.airport(route))
        } else {
            nav.open(.airport(route))
        }
    }

    /// Ask, with the question the search sent where there is one: its
    /// card, as every thing's is.
    func ask(_ question: String?) {
        search.close()
        nav.open(.ask(question))
    }

    /// The height of the map the sheet covers: none beside the sidebar.
    private var mapInset: CGFloat {
        layout == .sheet && sheetUp ? sheetHeight : 0
    }

    /// The point held on the map, whichever holds its card.
    private var heldRoute: String? { nav.heldRoute }

    /// The map with its buttons and banners, under the sheet or beside
    /// the sidebar.
    private var map: some View {
        ChartMap(
            template: charts.template, minZoom: charts.base?.minZoom ?? 5, maxZoom: charts.base?.maxZoom ?? 12,
            course: plan.course, checkpoints: plan.checkpoints,
            procedurePaths: plan.legs.compactMap { $0.procedure?.path.compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil } },
            // A flown track's replay, else the dry run: the same airplane.
            simulated: Replay.shared.fix ?? dryRun.fix,
            traffic: traffic.on ? traffic.planes : [],
            ownFt: (dryRun.fix ?? ownShip.fix)?.altitudeFt,
            onRegion: { centre, radius in traffic.mapCentre = centre; traffic.mapRadiusNm = radius },
            // A field tapped on the chart opens its card, half way up, as
            // the web app does.
            onAirport: { ident in open(ident) },
            following: $following, routeAway: $routeAway, fitRequest: fitRequest,
            flight: flightLayer,
            extras: MapExtrasInput(
                held: heldRoute.flatMap { AirportRoute($0).heldPoint },
                selectedField: heldRoute.flatMap { AirportRoute($0).field },
                waypoints: waypointsOn, classB: classBOn, plates: platesOn, approaches: plan.procedures,
                hiddenPlates: HiddenPlates.shared.keys,
                plateLook: PlateLook(opacity: plateOpacity, inverted: plateInverted, annotations: plateAnnotations),
                // A plate's page tapped: its card, half way up, as a field's.
                onPlate: { key in Navigator.shared.open(.plate(key)) },
                // A finger held on the chart: the airspace there, half way
                // up, as a field's card opens.
                onHold: { at in open(AirportRoute.airspace(lat: at.latitude, lon: at.longitude).text) },
                onWaypoint: plan.course != nil ? { (ident: String, at: CLLocationCoordinate2D, action: CardAction) in
                    plan.drop(ident, at: at, then: action == .directTo ? .direct : .add, from: action == .directTo ? dryRun.fix ?? ownShip.fix : nil)
                } : nil),
            // A tap on the course opens its nearest leg's card, that leg
            // cased in green while it is in sight (RouteLegView).
            routeLegs: RouteLegInput(
                legs: plan.course != nil ? RouteLegModel.mapLegs(plan) : [],
                selected: { if case .leg(let index) = nav.top { return index }; return nil }(),
                onSelect: { index in Navigator.shared.open(.leg(index)) }),
            // The route's fields worse by the flight's time there, and the
            // airplane's demonstrated crosswind for the wind arrows' red.
            fieldWeather: FieldWeatherInput(
                worse: FieldWeatherMarks.worse(plan.briefing, fields: Set([plan.dep, plan.dest] + plan.stops).subtracting([""])),
                alternates: AlternateCheck.shared.atEta,
                demonstratedKt: FieldWeatherMarks.demonstratedKt(plan)),
            hazardLegs: plan.hazardLegs,
            bottomInset: mapInset,
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
                    MapLoading(bottom: mapInset).transition(.opacity)
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
                    if traffic.on, let problem = traffic.marksProblem { MapChip(problem, colour: WingtipInk.caution) }
                }
                .padding(.leading, WingtipSpace.md).padding(.top, WingtipSpace.md)
            }
            // About own ship's real fix, never the dry run's: the traffic near
            // it is told in a notification (Traffic.tellNear).
            .task { await traffic.run { [ownShip] in ownShip.fix } }
            // The airplane tracked, its reports from the map's answers and its
            // own; the watches set; the alerts ahead said aloud where asked.
            .task { await Tracking.shared.run() }
            // The in-flight copilot looks again every few seconds while flying
            // with a route (Copilot): own ship's fix or the dry run's.
            .task {
                while !Task.isCancelled {
                    await Copilot.shared.look(fix: dryRun.fix ?? ownShip.fix, flying: InFlight.shared.underway, plan: plan,
                                              ahead: ownShip.ahead, minimums: verdict.minimums)
                    try? await Task.sleep(for: .seconds(3))
                }
            }
            .onChange(of: traffic.planes) { _, planes in Tracking.shared.heard(planes) }
            .onChange(of: ownShip.ahead) { _, alerts in SpokenAlerts.shared.hear(alerts) }
            // The ATC copilot: each settled transmission read, the radio listened to while flying where turned on.
            .onChange(of: ClearanceListener.shared.heard) { _, heard in AtcCopilot.shared.observe(heard, tail: plan.tail) }
            .task(id: "\(InFlight.shared.underway)|\(plan.tail ?? "")|\(AtcCopilot.shared.mode.rawValue)") {
                await AtcCopilot.shared.follow(flying: InFlight.shared.underway, tail: plan.tail)
            }
            .modifier(AutoLogbookHost()) // The flight logged from its track once landed and at rest.
            .modifier(AirplaneHost()) // The airplanes' figures in step with the sign-in (Airplane/).
            // Each fix, own ship's or the dry run's airplane, asked of the
            // engine once for the instruments, the strip and the glide ring
            // (InFlight); again when the route changes under it.
            .onChange(of: dryRun.fix ?? ownShip.fix, initial: true) { _, fix in InFlight.shared.took(fix, plan: plan) }
            .onChange(of: plan.course) { _, _ in InFlight.shared.took(dryRun.fix ?? ownShip.fix, plan: plan) }
            .onChange(of: ownShip.groundFt) { _, ft in InFlight.shared.terrainFt = ft }
            // The window's UndoManager for the route's history: shake to undo
            // and the Edit menu (PlanHistory).
            .onAppear { plan.undoManager = undoManager }
            .onChange(of: undoManager) { _, manager in plan.undoManager = manager }
            // Siri listens for the fields the shortcuts' airport entity
            // suggests (the kept route's: AirportEntityQuery.suggestedEntities),
            // and Spotlight finds them, so both are told again when the route
            // changes (AirportSpotlight).
            .onAppear { AirportSpotlight.refresh() }
            // A field's mark held: its card's preview and the plan's three.
            .onAppear { AirportMarkMenu.shared.input = markPreview }
            .onChange(of: plan.idents) { _, _ in AirportSpotlight.refresh() }
            // Siri's or a Shortcut's ask, taken as it comes and as the app
            // opens with one waiting (the intents run before this has drawn).
            .task(id: pending.command) { await apply(pending.take()) }
    }
}

#Preview("RootView") {
    RootView()
        .environment(Session())
        .environment(Charts())
        .environment(Plan())
        .environment(OwnShip())
        .environment(DryRun())
        .environment(Traffic())
        .environment(Verdict())
}
