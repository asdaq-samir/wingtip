import CoreLocation
import SwiftUI
import UIKit

/// The map under a sheet with three sizes -- the pill, half and full, as
/// Apple Maps has them and as the web app imitates them -- holding the
/// four tabs. The system's own sheet, so the drag, the detents and the
/// glass are iOS's, not a copy.
struct RootView: View {
    @Environment(Charts.self) private var charts
    @Environment(Plan.self) var plan
    @Environment(OwnShip.self) var ownShip
    @Environment(DryRun.self) private var dryRun
    @Environment(Traffic.self) private var traffic
    @Environment(Verdict.self) private var verdict
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(\.undoManager) private var undoManager
    @State var detent: PresentationDetent = .medium
    @State private var sheetUp = true
    // The tab opened first; a launch argument (-tab airport) picks
    // another, for CI's pictures of each. The tab a scene was on comes
    // back with the scene (SceneStorage), as Apple restores state: a
    // restored scene lands where the pilot left it, not on the plan.
    @SceneStorage("tab") private var sceneTab: String?
    /// The screen's layout, as the web app's Screen row has it: the four
    /// tabs, or the strip (StripSheetView: one field, the flight as one
    /// strip; the owner's pick of 2026-11-04). The same key as the web's
    /// preference; a `-layout strip` launch argument sets it for CI's
    /// pictures.
    @AppStorage("layout") private var layoutName = "tabs"
    @State var tab: Tabs = Tabs(rawValue: UserDefaults.standard.string(forKey: "tab") ?? "") ?? .fpl
    @State private var airports: [String] = []
    @State private var following = false
    @State private var routeAway = false
    @State private var fitRequest = 0
    /// Whether the map has shown (ChartMap's reveal): the loading mark is
    /// over it until then.
    @State private var mapShown = false
    /// The height the sheet covers at the foot of the screen, as it is now.
    @State private var sheetHeight: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Ask (AskView) up: a sheet over the tabs' sheet on the iPhone, so the
    /// system presents it, since one view presents one sheet at a time;
    /// over the map on the iPad.
    @State private var asking = false
    /// The iPad's inspector card (SplitLayout).
    @State var sideCard: SideCard?
    /// What Siri or a Shortcut asked for (the App Intents), done here once
    /// the app is on the screen: the owner's ask, 2026-11-03, Siri and
    /// Shortcuts through App Intents.
    @State private var pending = PendingCommand.shared
    // Setup's map switches (MapExtrasInput.Keys).
    @AppStorage(MapExtrasInput.Keys.waypoints) private var waypointsOn = false
    @AppStorage(MapExtrasInput.Keys.classB) private var classBOn = false
    @AppStorage(MapExtrasInput.Keys.plates) private var platesOn = true

    enum Tabs: String, Hashable { case fpl, airport, airplane, setup }

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
                FlightUI.shared.card = .airplane(plane.hex.lowercased())
            },
            onDragged: { Tracking.shared.follow = false }
        )
    }

    /// The sheet's lowest size, the pill: the figures' line and the tabs'
    /// names, as the web app's pill is.
    static let pill = PresentationDetent.height(132)

    var layout: RootLayout { .of(sizeClass, verticalSizeClass) }

    var body: some View {
        Group {
            switch layout {
            case .sheet:
                map
                    .sheet(isPresented: $sheetUp) {
                        Group {
                            if layoutName == "strip" {
                                StripSheetView(detent: $detent, airports: $airports)
                            } else {
                                SheetView(tab: $tab, airports: $airports, pill: detent == RootView.pill, asking: $asking)
                            }
                        }
                        // How much of the map the sheet covers, for the map's
                        // opening point and the loading mark over it.
                        .onGeometryChange(for: CGFloat.self) { $0.size.height + $0.safeAreaInsets.bottom } action: { sheetHeight = $0 }
                        .presentationDetents([RootView.pill, .medium, .large], selection: $detent)
                        .presentationBackgroundInteraction(.enabled(upThrough: .medium))
                        // The system's Liquid Glass sheet and its own corners
                        // on iOS 26; the material on iOS 18 (Design/Glass.swift).
                        .sheetGlass()
                        .interactiveDismissDisabled()
                    }
            case .split:
                SplitLayout(map: map, tab: $tab, airports: $airports, card: $sideCard)
                    .sheet(isPresented: $asking) { AskView() }
            }
        }
        // The scene's tab kept and brought back (SceneStorage); a launch
        // argument's tab (CI's pictures) wins over the kept one.
        .onAppear {
            if let raw = sceneTab, let kept = Tabs(rawValue: raw), !CommandLine.arguments.contains("-tab") { tab = kept }
            if let at = CommandLine.arguments.firstIndex(of: "-layout"), at + 1 < CommandLine.arguments.count {
                layoutName = CommandLine.arguments[at + 1]
            }
        }
        .onChange(of: tab) { _, now in sceneTab = now.rawValue }
        // The picked look's tint, the brand's blue by default (Look).
        .lookTint()
    }

    /// A field or a point opened from the map: in the Airport tab, half
    /// way up, on the iPhone; in the inspector on the iPad.
    func open(_ route: String) {
        if layout == .split {
            sideCard = .airport(route)
            return
        }
        tab = .airport
        airports = [route]
        if detent != .medium { detent = .medium }
    }

    /// The height of the map the sheet covers: none beside the sidebar.
    private var mapInset: CGFloat {
        layout == .sheet && sheetUp ? sheetHeight : 0
    }

    /// The point held on the map, whichever holds its card.
    private var heldRoute: String? {
        if layout == .split {
            if case .airport(let text) = sideCard { return text }
            return nil
        }
        return airports.last
    }

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
                waypoints: waypointsOn, classB: classBOn, plates: platesOn, approaches: plan.procedures,
                // A finger held on the chart: the airspace there, half way
                // up, as a field's card opens.
                onHold: { at in open(AirportRoute.airspace(lat: at.latitude, lon: at.longitude).text) },
                onWaypoint: plan.course != nil ? { (ident: String, at: CLLocationCoordinate2D, action: CardAction) in
                    plan.drop(ident, at: at, then: action == .directTo ? .direct : .add, from: action == .directTo ? dryRun.fix ?? ownShip.fix : nil)
                } : nil
            ),
            // A tap on the course opens its nearest leg's sheet, that leg
            // cased in green while it is open (RouteLegSheet).
            routeLegs: RouteLegInput(
                legs: plan.course != nil ? RouteLegModel.mapLegs(plan) : [],
                selected: { if case .leg(let index) = FlightUI.shared.card { return index }; return nil }(),
                onSelect: { index in FlightUI.shared.card = .leg(index) }
            ),
            hazardLegs: plan.hazardLegs,
            bottomInset: mapInset,
            onReveal: { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.15)) { mapShown = true } }
        )
        .ignoresSafeArea()
        // Over the map, under its buttons, until it shows: Wingtip's mark
        // turning where the map opens.
        .overlay {
            if !mapShown {
                MapLoading(bottom: mapInset).transition(.opacity)
            }
        }
        .overlay(alignment: .topTrailing) {
            // In the strip the field is the way to the assistant, so the
            // sparkle is not drawn.
            MapButtons(following: $following, routeAway: routeAway && plan.course != nil, fitRoute: { fitRequest += 1 },
                       ask: layoutName == "strip" ? nil : { asking = true })
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
            }
            .padding(.trailing, 64)
        }
        .overlay(alignment: .topLeading) {
            VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                if dryRun.fix != nil { DryRunControls() }
                WatchBanner()
                // The licence's credit, beside the traffic it covers.
                if traffic.on, !traffic.planes.isEmpty {
                    Text(Traffic.credit(traffic.source)).font(.caption2).padding(.horizontal, WingtipSpace.sm).padding(.vertical, 2)
                        .floatingGlass(in: Capsule(), material: .thinMaterial)
                    if let problem = traffic.marksProblem {
                        Text(problem).font(.caption2).foregroundStyle(.orange).padding(.horizontal, WingtipSpace.sm).padding(.vertical, 2)
                            .floatingGlass(in: Capsule(), material: .thinMaterial)
                    }
                }
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
        .onChange(of: plan.idents) { _, _ in AirportSpotlight.refresh() }
        // Siri's or a Shortcut's ask, taken as it comes and as the app
        // opens with one waiting (the intents run before this has drawn).
        .task(id: pending.command) { await apply(pending.take()) }
    }
}

/// The four tabs of the planner, in the sheet: FPL, Airport, Airplane
/// and Setup.
struct SheetView: View {
    @Environment(Plan.self) var plan
    /// In the iPad's sidebar, whose tab bar is at the top.
    @Environment(\.splitLayout) private var split
    @Binding var tab: RootView.Tabs
    @Binding var airports: [String]
    /// At the pill: the figures over the tab bar, nothing else.
    var pill: Bool
    /// Ask (AskView) presented from here, a sheet over this one: the map's
    /// sparkle button sets it (RootView).
    @Binding var asking: Bool

    var body: some View {
        TabView(selection: $tab) {
            Tab("FPL", systemImage: WingtipIcon.tabFPL, value: RootView.Tabs.fpl) {
                FPLView().clearOfTabBar(!split)
            }
            Tab("Airport", systemImage: WingtipIcon.tabAirport, value: RootView.Tabs.airport) {
                AirportSearchView(path: $airports).clearOfTabBar(!split)
            }
            Tab("Airplane", systemImage: WingtipIcon.tabAirplane, value: RootView.Tabs.airplane) {
                AircraftView().clearOfTabBar(!split)
            }
            Tab("Setup", systemImage: WingtipIcon.tabSetup, value: RootView.Tabs.setup) {
                SetupView().clearOfTabBar(!split)
            }
        }
        // The pill shows the flight's figures where the tab's own content
        // would be out of sight anyway, over the tab bar.
        .overlay(alignment: .top) {
            if pill {
                FiguresStrip()
                    .padding(.top, WingtipSpace.md)
                    .frame(maxWidth: .infinity)
                    .background(.regularMaterial)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: pill)
        // The Undo bar over the tab bar, where the edit was made.
        .overlay(alignment: .bottom) {
            UndoBar()
                .padding(.bottom, WingtipSize.tabBar)
                .animation(.easeOut(duration: 0.25), value: plan.undoNote)
        }
        // An airplane's card, a point pressed on the map, a hold, a flown
        // track, over the tabs.
        .modifier(FlightSheets())
        .sheet(isPresented: $asking) { AskView() }
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

#Preview("SheetView") {
    @Previewable @State var tab: RootView.Tabs = .fpl
    @Previewable @State var airports: [String] = []
    SheetView(tab: $tab, airports: $airports, pill: false, asking: .constant(false))
        .environment(Session())
        .environment(Charts())
        .environment(Plan())
        .environment(OwnShip())
        .environment(DryRun())
        .environment(Traffic())
        .environment(Verdict())
}
