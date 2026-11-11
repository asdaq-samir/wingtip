import SwiftUI

/// The sheet's content in the strip layout, the twin of the web app's
/// features/strip (the owner's pick of 2026-11-04, "let's try it"): in
/// the system sheet RootView presents with its three sizes. The pill is
/// the one search's row -- the same search as the plan's (OneSearch),
/// with the microphone and the account button beside it, like Apple Maps
/// -- and half way and up the ribbon, then the flight as one strip in
/// time: the head (the verdict, the route's line, at most three
/// findings), the timeline (StripList) and, with no route, the welcome.
/// The existing screens -- a field's card, the Brief, the nav log, the
/// airplane, the logbook, Setup -- open as pages of the stack, each with
/// its title and a close that goes back one level. In the air the strip
/// is StripAir with the radio under it.
///
/// A line typed or said is done by the search's FieldRunner; a question
/// is answered on the strip itself (StripAnswerCard); why not is said
/// under the field (lib/problems' rule: where it happens, never a toast).
struct StripSheetView: View {
    @Environment(\.lookAccent) private var accent
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(Session.self) private var session
    @Environment(Verdict.self) private var verdict
    /// The sheet's size, RootView's: the field focused brings it up clear
    /// of the keyboard; a route planned brings the pill to half.
    @Binding var detent: PresentationDetent
    /// The sheet's stack as the plan has it (RootView's): a field or a
    /// point opened from the map is pushed there, and its card here.
    @Binding var opened: [SheetPage]
    /// The one search, the plan's own (RootView keeps it).
    let search: OneSearchModel
    @State private var path: [StripPage] = []
    @State private var client = AssistantClient()
    private var listener: ClearanceListener { ClearanceListener.shared }

    /// The pages the stack opens over the strip.
    enum StripPage: Hashable {
        case airport(String)
        case brief, navlog, profile, airplane, logbook, instructor, setup, clearance, file, flights, procedures
        case leg(Leg)
        case list(AirportShelf.Shows)

        var title: String {
            switch self {
            case .airport(let text): return AirportRoute(text).heldPoint != nil ? "Airspace" : text
            case .brief: return "Brief"
            case .navlog: return "Nav log"
            case .profile: return "Profile"
            case .airplane: return "My airplane"
            case .logbook: return "Logbook"
            case .instructor: return "Instructor"
            case .setup: return "Setup"
            case .clearance: return "Clearance"
            case .file: return "File"
            case .flights: return "Flights"
            case .procedures: return "Procedures"
            case .leg(let leg): return "To \(leg.to)"
            case .list(let shows): return shows.rawValue.prefix(1).uppercased() + shows.rawValue.dropFirst()
            }
        }
    }

    /// In the air on the route -- moving, within 3 nm of the line -- as
    /// FiguresStrip counts it (the engine's `in_flight`, InFlight): a dry
    /// run's airplane counts as flying.
    private var flyingFix: OwnShip.Fix? {
        InFlight.shared.onRoute ? InFlight.shared.fix : nil
    }

    private var points: [StripPoint] {
        StripData.points(dep: plan.dep, dest: plan.dest, stops: plan.stops, legs: plan.legs, checkpoints: plan.checkpoints, course: plan.course)
    }

    var body: some View {
        NavigationStack(path: $path) {
            home
                .navigationDestination(for: StripPage.self) { page in
                    pageView(page)
                        .navigationTitle(page.title)
                        .navigationBarTitleDisplayMode(.inline)
                }
                // A card's own links (a field's NOTAMs, Ready to Fly's
                // Brief) push here as they do on the plan's sheet.
                .navigationDestination(for: SheetPage.self) { page in SheetPageView(page: page, nearest: []) }
        }
        .chartInkTheme()
        // A field tapped on the chart, or a point held: its card, half
        // way up, as the plan's sheet opens it.
        .onChange(of: opened) { _, now in
            if let last = now.last?.airportRoute {
                path.append(.airport(last))
                if detent == RootView.pill { detent = .half }
            }
        }
        .takesAskedScreens { _ = open($0) } // Siri's Brief, and a screen asked for by name (StripSheetView+Screens)
        // The Go / No-Go for the head, asked as the Brief asks it.
        .task(id: verdict.key(for: plan)) { await verdict.refresh(plan: plan, signedIn: session.signedIn) }
        .onChange(of: plan.tail, initial: true) { _, tail in listener.tail = tail }
        // A thing's card over the strip, as over the plan, and the alerts
        // and the emergency assistant from the one presenter on screen.
        .cardHost(search: search)
    }

    private var home: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: WingtipSpace.md) {
                if let fix = flyingFix {
                    let along = Result { try StripData.positionAlong(points, fix: fix.coordinate) }
                    StripAir(points: points, position: try? along.get(), fix: fix)
                    if case .failure(let error) = along {
                        Text("Your place on the strip couldn't be worked out: \(error.localizedDescription)")
                            .font(ChartInk.note).foregroundStyle(WingtipInk.caution)
                    }
                    radio
                } else {
                    if !client.turns.isEmpty {
                        StripAnswerCard(client: client, onClose: { client.clear() })
                    }
                    StripRibbonRow(dep: plan.dep, dest: plan.dest, verdict: plan.routed ? verdict.answer?.line : nil,
                                   eteMin: plan.totals?.eteMin, fuelGal: plan.totals?.fuelGal, points: points)
                    if plan.routed, plan.course != nil {
                        if let stage = plan.stage {
                            Label(stage, systemImage: "ellipsis").font(ChartInk.note).foregroundStyle(.secondary)
                        }
                        if let planProblem = plan.problem {
                            Text(planProblem.brief ?? planProblem.detail).font(ChartInk.detail.weight(.semibold)).foregroundStyle(WingtipInk.caution)
                        }
                        StripHead(onBrief: { path.append(.brief) }, onFile: { path.append(.file) })
                        StripList(points: points,
                                  onField: { path.append(.airport($0)) },
                                  onPlates: { path.append(.airport($0)) },
                                  onClearance: { path.append(.clearance) },
                                  onLeg: { path.append(.leg($0)) },
                                  onDebrief: { path.append(.flights) })
                    } else {
                        welcome
                    }
                }
            }
            .padding(.horizontal, WingtipSpace.lg)
            .padding(.bottom, WingtipSpace.xl)
            .padding(.top, WingtipSpace.sm)
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationBarTitleDisplayMode(.inline)
        .oneSearch(search, host: host)
        .accessibilityIdentifier("strip-sheet")
    }

    /// Where the one search's picks go on the strip: its own pages.
    private var host: SearchHost {
        SearchHost(
            card: { path.append(.airport($0)); up() },
            showPlan: { path = [] },
            page: { page in
                switch page {
                case .screen(let screen): openScreen(screen)
                case .airport(let text): path.append(.airport(text))
                case .instructing: _ = open(.instructor)
                case .notams: path.append(.brief)
                case .practice, .training, .contact, .leg, .flight: _ = open(.setup)
                // A thing's card over the strip, as over the plan (Navigator).
                case .traffic, .tail, .hold, .flown, .ask, .mapSettings, .plate, .clearance, .welcome, .sharedFlight, .flightLogged:
                    Navigator.shared.open(page)
                }
            },
            screen: { openScreen($0) },
            field: { open($0) },
            ask: { ask($0) })
    }

    /// A screen by its name on the strip: its page where the strip has
    /// one, else as the plan's sheet does it.
    private func openScreen(_ screen: Screen) {
        if let word = Self.field(for: screen) {
            _ = open(word)
            return
        }
        switch screen {
        case .airport, .ask: search.presented = true
        case .emergency: Emergency.shared.open = .link
        default: path = []
        }
    }

    /// The first flight's welcome, the field at the foot being the way in.
    private var welcome: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            HStack(spacing: WingtipSpace.md) {
                Image(systemName: "airplane").foregroundStyle(.tint).accessibilityHidden(true)
                Text("Where to?").font(ChartInk.heading)
            }
            Text("Type or say a field, a town or a route in the search above. Wingtip plans from where you are: the route, the checkpoints you'll see from the air, the nav log and a weather brief, all on one strip.")
                .font(ChartInk.text)
        }
        .padding(WingtipSpace.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .inkCard()
        .accessibilityIdentifier("strip-welcome")
    }

    /// The radio in the air: a call to us with its chips (RadioCallBanner),
    /// and the captions of what the radio says.
    @ViewBuilder
    private var radio: some View {
        if let call = listener.call {
            RadioCallBanner(call: call)
        }
        if listener.listening || listener.problem != nil {
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                if let problem = listener.problem { ProblemLine(problem) }
                ForEach(listener.heard.suffix(2)) { t in
                    Text(t.text).lineLimit(2).foregroundStyle(t.forUs ? accent : Color.primary)
                }
            }
            .font(ChartInk.detail)
            .padding(WingtipSpace.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .inkCard()
        }
    }

    @ViewBuilder
    private func pageView(_ page: StripPage) -> some View {
        switch page {
        case .airport(let text): AirportDestination(route: AirportRoute(text), nearest: search.nearest)
        case .brief: BriefView()
        case .navlog: navLog
        case .profile: ProfileCard()
        case .airplane: AircraftView()
        case .logbook: LogbookView()
        case .instructor: InstructorView()
        case .setup: SetupView()
        case .clearance: ClearanceSheet()
        case .file: FlightServiceView()
        case .flights: FlightsView()
        case .procedures:
            List {
                Section("Procedures") {
                    ProceduresRow(ident: plan.dep, kinds: ["departure"])
                    ForEach(plan.stops + [plan.dest], id: \.self) { field in
                        ProceduresRow(ident: field, kinds: ["arrival", "approach"])
                    }
                }
            }
        // The one Route Leg card, the plan's and the map's.
        case .leg(let leg): RouteLegView(index: RouteLegModel.index(of: leg, at: plan.legs.firstIndex(of: leg) ?? 0, plan: plan))
        case .list(let shows):
            AirportListView(shows: shows, nearest: search.nearest)
        }
    }

    /// The nav log as a page: each leg's row (FPL's LegRow) into its detail.
    private var navLog: some View {
        List {
            Section(plan.altitudeFt.map { "Nav Log · \(Format.cruiseAltitude($0))" } ?? "Nav Log") {
                ForEach(Array(plan.legs.enumerated()), id: \.element.id) { i, leg in
                    NavigationLink(value: StripPage.leg(leg)) { LegRow(leg: leg, number: i + 1) }
                }
            }
        }
    }

    // MARK: The search's line, done

    /// The pill up to half, where the answer is.
    private func up() {
        if detent == RootView.pill { detent = .half }
    }

    /// A question, answered on the strip (StripAnswerCard).
    private func ask(_ question: String) {
        client.ask(question, context: AssistantContext.make(plan: plan, ownShip: ownShip, session: session, minimums: verdict.minimums))
        up()
    }

    /// A screen by its word, each the existing one as a page of the
    /// stack; why not where the plan is not far enough along for it, in
    /// the web app's words.
    @discardableResult
    private func open(_ screen: FieldScreen) -> String? {
        let routed = plan.routed
        switch screen {
        case .airplane: path.append(.airplane); detent = .large
        case .logbook: path.append(.logbook); detent = .large
        case .instructor: path.append(.instructor); detent = .large
        case .setup: path.append(.setup); detent = .large
        case .brief:
            guard routed else { return "Plan a route first: a field, a town or two idents." }
            path.append(.brief); up()
        case .nearest:
            AirportShelf.shared.show(.nearest)
            path.append(.list(.nearest)); up()
        case .fuel, .food, .stops:
            // The fuel, food and rest stops are the web app's for now; the
            // nearest fields, which have the fuel, are here.
            AirportShelf.shared.show(.nearest)
            path.append(.list(.nearest)); up()
            return "Stops with fuel and food are on the website for now; these are the nearest fields."
        case .routes:
            guard routed else { return "Plan a route first, then its other ways are chips at the head of the strip." }
            up()
        case .altitude, .profile:
            // Full height, so the altitude slider never fights the sheet's
            // drag (the owner's spec of 2026-11-10).
            guard routed, plan.profile != nil else { return "Plan a route first; then say an altitude, \"altitude 5500\"." }
            path.append(.profile); detent = .large
        case .procedures:
            guard !plan.dest.isEmpty else { return "Plan a route first: the procedures are the destination's." }
            path.append(.procedures); up()
        case .navlog:
            guard routed, plan.course != nil else { return "Plan a route first." }
            path.append(.navlog); up()
        case .share:
            guard routed else { return "Plan a route first." }
            up()
            return "Share, File and Clear are under ••• at the head of the strip."
        case .file:
            guard routed, plan.totals != nil else { return "A flight plan needs a route from an airport, its nav log in." }
            path.append(.file); up()
        case .clearance, .radio:
            path.append(.clearance); up()
        case .dryrun:
            guard routed, plan.profile != nil else { return "Plan a route first." }
            path.append(.profile); detent = .large
            return "Dry run is the Profile's button, at the side view's foot."
        case .saved, .recentRoutes:
            path.append(.flights); up()
        case .favorites:
            AirportShelf.shared.show(.favorites)
            path.append(.list(.favorites)); up()
        case .recents:
            AirportShelf.shared.show(.recents)
            path.append(.list(.recents)); up()
        case .map:
            return "The map's switches are in Settings, under the account button."
        case .emergency:
            Emergency.shared.open = .voice
        }
        return nil
    }
}
