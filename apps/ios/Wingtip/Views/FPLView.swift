import SwiftUI

/// FPL: the route box -- the route's ends, its Routes, and the airplane,
/// the altitude and the route's buttons (RouteBoxRow) -- then the stops,
/// the route's own edits, the figures for the whole flight and the
/// procedures. The nav log is behind the route box's ••• and Share at the
/// bar's left, as the web has them (the owner, 2026-11-09).
struct FPLView: View {
    @Environment(Plan.self) private var plan
    @Environment(Charts.self) private var charts
    /// Opens a card in the iPad's inspector; nil on the iPhone.
    @Environment(\.openCard) private var openCard
    @FocusState private var focused: Field?
    @State private var path = NavigationPath()

    enum Field { case dep, dest, altitude }
    /// FPL's own pages.
    enum Page: String { case profile, brief, navLog = "navlog", flights, airplane }
    @State private var altitude = ""
    /// The fields' widths follow the type size, so an ident still fits at
    /// the larger sizes.
    @ScaledMetric(relativeTo: .body) private var identWidth = 110.0

    /// The hundreds typed, flown; nothing typed, the planner's own pick.
    private func flyAltitude() {
        focused = nil
        let digits = altitude.filter(\.isNumber)
        plan.ownAltitudeFt = digits.isEmpty ? nil : Double(digits).map { $0 * 100 }
        plan.plan()
    }

    /// A page pushed on the iPhone; the profile, the brief and the flights
    /// in the inspector on the iPad, as CardLink opens them.
    private func open(_ page: Page) {
        switch (page, openCard) {
        case (.profile, let card?): card(.profile)
        case (.brief, let card?): card(.brief)
        case (.flights, let card?): card(.flights)
        default: path.append(page.rawValue)
        }
    }

    var body: some View {
        @Bindable var plan = plan
        NavigationStack(path: $path) {
            List {
                Section {
                    HStack(spacing: WingtipSpace.sm) {
                        routeField("From", text: $plan.dep, field: .dep)
                        Image(systemName: "arrow.right").foregroundStyle(.secondary)
                        routeField("To", text: $plan.dest, field: .dest)
                        // A clearance heard into the route (ClearanceSheet).
                        Button { focused = nil; ClearanceListener.shared.sheetText = nil; ClearanceListener.shared.sheetShown = true } label: {
                            Image(systemName: ClearanceListener.shared.listening ? "mic.fill" : "mic")
                                // The 44-point hit area round the glyph, which does not grow.
                                .contentShape(Rectangle().inset(by: -10))
                        }
                            .buttonStyle(.borderless)
                            .accessibilityLabel(ClearanceListener.shared.listening ? "Listening to the radio" : "Listen to the radio")
                        Button("Plan") { focused = nil; plan.plan() }
                            .buttonStyle(.borderedProminent)
                            // ⌘Return plans from an iPad's keyboard; Return
                            // in a field already does (onSubmit).
                            .keyboardShortcut(.return, modifiers: .command)
                            .disabled(!plan.routed || plan.planning)
                    }
                    if plan.routed && plan.course != nil && RouteLine.shows(plan.routes, picked: plan.pickedChip, problem: plan.routesProblem) {
                        // Routes: the ways to fly it, right under the route's
                        // ends, folding as a runway line does.
                        RouteLineRow()
                    }
                    if let stage = plan.stage {
                        Label(stage, systemImage: "ellipsis").font(WingtipType.note).foregroundStyle(.secondary)
                    } else if let at = plan.plannedAt, !plan.planning, Date().timeIntervalSince(at) > 3600 {
                        // A plan an hour old or more, as the web app says it:
                        // the winds and the weather were read then.
                        Label("Planned \(at.formatted(.relative(presentation: .named)))", systemImage: "clock").font(WingtipType.note).foregroundStyle(.secondary)
                    }
                    if let problem = plan.problem { PlanProblemView(problem: problem) }
                    // Where the tanks do not hold a flight, said; the fuel
                    // stops themselves are the route line's "Your Route" chip.
                    ForEach(plan.totals?.fuelStops ?? []) { suggestion in
                        Label("\(suggestion.departure) → \(suggestion.destination) needs fuel on the way", systemImage: "fuelpump")
                            .font(WingtipType.detail.weight(.semibold)).foregroundStyle(.orange)
                    }
                    if plan.routed {
                        RouteBoxRow(altitude: $altitude, focused: $focused, open: open, fly: flyAltitude)
                            .toolbar {
                                if focused == .altitude {
                                    ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Fly") { flyAltitude() } }
                                }
                            }
                    }
                }
                if !plan.stops.isEmpty {
                    // The stops in order, each a swipe from going and all
                    // of them draggable into another order, as the web
                    // app's route list has them.
                    Section(title: "Stops") {
                        ForEach(Array(plan.stops.enumerated()), id: \.offset) { _, stop in
                            RoutePointMenu(ident: stop)
                        }
                        .onDelete { at in plan.stops.remove(atOffsets: at); plan.plan() }
                        .onMove { from, to in plan.stops.move(fromOffsets: from, toOffset: to); plan.plan() }
                    }
                }
                // The route's own edits and the flight in the air.
                RouteExtrasSection()
                if let totals = plan.totals {
                    Section {
                        FigureRow {
                            stripFigure("TO", plan.dest)
                            stripFigure("DIST", Format.distance(totals.distanceNm), spoken: SpokenFigures.nauticalMiles(totals.distanceNm))
                            // Time and fuel are an airplane's: none picked,
                            // none shown (docs/decisions/0011).
                            if plan.airplaneChosen {
                                stripFigure("ETE", totals.eteMin.map(Format.duration) ?? Format.none, spoken: totals.eteMin.map(SpokenFigures.minutes))
                                stripFigure("FUEL", Format.fuel(totals.fuelGal), spoken: totals.fuelGal.map(SpokenFigures.gallons),
                                            warn: (totals.fuelMarginGal ?? 0) < 0)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                if plan.course != nil {
                    // Each field's procedures, pull-downs as the web app's
                    // route list has them: the departure's departures, every
                    // landing's arrivals and approaches.
                    Section(title: "Procedures") {
                        ProceduresRow(ident: plan.dep, kinds: ["departure"])
                        ForEach(plan.stops + [plan.dest], id: \.self) { field in
                            ProceduresRow(ident: field, kinds: ["arrival", "approach"])
                        }
                    }
                }
                if plan.course != nil, let template = charts.template {
                    // The chart along the route for the air, as the web app's
                    // KeepRoute keeps it: tapped once, the count as it goes.
                    Section {
                        Button {
                            plan.keepForTheAir(template: template, minZoom: charts.base?.minZoom ?? 6)
                        } label: {
                            if let keeping = plan.keeping {
                                Label(keeping.kept >= keeping.wanted ? "Kept for the Air: \(keeping.wanted) tiles" : "Keeping for the Air: \(keeping.kept) of \(keeping.wanted)", systemImage: keeping.kept >= keeping.wanted ? "checkmark.icloud" : "icloud.and.arrow.down")
                            } else {
                                Label("Keep for the Air", systemImage: "icloud.and.arrow.down")
                            }
                        }
                        .disabled(plan.keeping.map { $0.kept < $0.wanted } ?? false)
                    }
                }
            }
            .navigationTitle("Flight Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { FPLToolbar(plan: plan, flights: { open(.flights) }) }
            .navigationDestination(for: Leg.self) { leg in LegDetailView(leg: leg).closesBack() }
            .navigationDestination(for: String.self) { page in
                Group {
                    switch Page(rawValue: page) {
                    case .profile: ProfileCard()
                    case .brief: BriefView()
                    case .flights: FlightsView()
                    case .navLog: NavLogPage()
                    case .airplane: AircraftView()
                    case nil: FlightPage(name: page)
                    }
                }
                .closesBack()
            }
            .sheet(isPresented: Binding(get: { ClearanceListener.shared.sheetShown }, set: { ClearanceListener.shared.sheetShown = $0 })) {
                ClearanceSheet().presentationDetents([.medium, .large])
            }
            // The Brief asked for by Siri (BriefFlightIntent): its page.
            .onChange(of: BriefAsk.shared.wanted, initial: true) { _, now in if now, BriefAsk.shared.take() { open(.brief) } }
        }
    }

    private func routeField(_ label: String, text: Binding<String>, field: Field) -> some View {
        TextField(label, text: text)
            .textFieldStyle(.roundedBorder)
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
            .font(WingtipType.row.monospaced())
            .frame(maxWidth: identWidth)
            .focused($focused, equals: field)
            .onSubmit { if field == .dep { focused = .dest } else { plan.plan() } }
    }
}

/// FPL's bar, on the iPhone and in the iPad's column alike: Share at the
/// left, as the web's minimized bar has it (docs/decisions/0015, the
/// owner's of 2026-11-09), the pilot's saved flights beside it, and the
/// stops' Edit at the right. Clear is in the route box's ••• (RouteBoxRow).
struct FPLToolbar: ToolbarContent {
    let plan: Plan
    let flights: () -> Void

    var body: some ToolbarContent {
        if plan.routed {
            ToolbarItem(placement: .topBarLeading) { ShareMenu() }
        }
        ToolbarItem(placement: .topBarLeading) {
            Button(action: flights) { Label("Flights", systemImage: "tray.full") }
        }
        if !plan.stops.isEmpty {
            ToolbarItem(placement: .topBarTrailing) { EditButton() }
        }
    }
}

/// What the planner could not do with the route, said where it happened in
/// the app's one error style (ProblemLine's red), with the ways round it
/// the planner found and, where a point of the route is not known, Remove,
/// as the web's route box offers it.
struct PlanProblemView: View {
    @Environment(Plan.self) private var plan
    let problem: NavLogError

    /// The route's point the planner names as not known ("No airport goes
    /// by 'ZZZZ'."), where there is one.
    private var unknown: String? {
        plan.idents.first { problem.detail.contains("'\($0)'") || (problem.brief ?? "").contains("'\($0)'") }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            ProblemLine(problem.brief ?? problem.detail)
            ForEach(problem.reasons ?? [], id: \.self) { ProblemLine($0) }
            if let advice = problem.advice { Text(advice).font(WingtipType.note).foregroundStyle(.secondary) }
            HStack(spacing: WingtipSpace.sm) {
                if let unknown {
                    Button("Remove", role: .destructive) { plan.remove(unknown) }
                }
                // The ways round the planner found: a Class B's waypoint,
                // or the way round high ground.
                ForEach(problem.detours ?? []) { detour in
                    let added = "+\(Format.distance(detour.addedNm, decimals: 0))"
                    Button { plan.goRound(detour) } label: {
                        Label((detour.via ?? []).isEmpty ? "Fly via \(detour.ident) · \(added)" : "Go Round · \(added)",
                              systemImage: "arrow.triangle.turn.up.right.diamond")
                    }
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
    }
}

extension Plan {
    /// A point taken out of the route wherever it is: a stop removed, an
    /// end emptied for the pilot to type again. Undo brings it back.
    func remove(_ ident: String) {
        if dep == ident { dep = "" } else if dest == ident { dest = "" } else { stops.removeAll { $0 == ident } }
        if routed { plan() }
    }
}
