import SwiftUI

/// The plan, the sheet's FPL page (PlanSheet, SheetPages), with no bar
/// of its own so its first row is the route's: with a route, its card
/// (RouteCard: the route, Ready to Fly, the figures, Brief, Nav Log,
/// File and the route's •••), then its Routes, the airplane and the
/// altitude (RouteBoxRow), then the route as its timeline -- each point's
/// mark, ident, tanks and time, Add a Stop (RouteTimelineSection) -- the
/// route's own edits, in FPL's order; each field's procedures are on its
/// line (TimelineFieldParts, TimelineProcedureRows). The From and To
/// fields are the route typed: before it is whole, while one is typed in,
/// and until the planner's course is this route's. With none, the route
/// box empty, its close a level back (the web's, the owner's 2026-11-11
/// "We don't need plan a flight either"); Favorites, Recents and Nearest
/// are the Search page's.
struct PlanView: View {
    @Environment(Navigator.self) private var nav
    @Environment(Plan.self) private var plan
    @Environment(Charts.self) private var charts
    @Environment(Verdict.self) private var verdict
    @Environment(Session.self) private var session
    @FocusState private var focused: Field?
    @Environment(KeepForAir.self) private var keepForAir
    /// A page of the plan's, opened by the sheet: pushed on the iPhone, the
    /// profile, the brief and the flights in the inspector on the iPad.
    let open: (Screen) -> Void
    /// The one search asked to pick a point of the route: Add a Stop, a
    /// point's ident tapped to change it (PointAsk).
    let ask: (PointAsk) -> Void
    /// The route's fields' cards, asked once for the timeline's lines.
    @State private var cards = RouteFieldCards()
    /// A gauge tapped: the fuel to set leaving its field.
    @State private var setting: FuelSetAsk?

    enum Field { case dep, dest }

    /// The route read on its timeline: whole, its course in, nothing typed.
    private var onTimeline: Bool { plan.routed && plan.courseIsRoute && focused == nil }

    var body: some View {
        @Bindable var plan = plan
        List {
            if plan.routed {
                RouteCard(open: open)
                // Why the route's Share menu sent nothing (ShareMenu).
                if let shareProblem = plan.shareProblem { ProblemLine(shareProblem) }
            }
            Section {
                if !onTimeline { RouteEndsRow(focused: $focused) }
                if plan.routed && plan.course != nil && RouteLine.shows(plan.routes, picked: plan.pickedChip, problem: plan.routesProblem) {
                    // Routes: the ways to fly it, right under the route's
                    // ends, in the system's menu picker.
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
                        .font(WingtipType.detail.weight(.semibold)).foregroundStyle(WingtipInk.caution)
                }
                if plan.routed {
                    RouteBoxRow(open: open)
                }
            } header: {
                if !plan.routed {
                    // The box empty -- cleared, or never filled -- its close
                    // a level back, where the route's ••• is with a route
                    // (the web's route box, 2026-11-12): to the field's card
                    // it was flown to from, else to Search. Half a route
                    // keeps the ••• alone.
                    HStack {
                        Spacer()
                        // How the route is shown, picked before there is a
                        // route too (the owner, 2026-11-13), the menu
                        // holding that alone until there is one.
                        Menu {
                            ShowRouteAs()
                        } label: {
                            Label("More", systemImage: WingtipIcon.more).labelStyle(.iconOnly)
                        }
                        .glassButton()
                        .buttonBorderShape(.circle)
                        .accessibilityIdentifier("route-more")
                        // The close glyph in glass, as a card's close is
                        // drawn in its bar (CloseButton's role-close in a
                        // list header drew the word "Close" alone).
                        if !plan.routeState.hasPoints {
                            Button {
                                focused = nil
                                nav.closeEmptyRoute()
                            } label: {
                                Label("Close", systemImage: WingtipIcon.close).labelStyle(.iconOnly)
                            }
                            .glassButton()
                            .buttonBorderShape(.circle)
                            .accessibilityIdentifier("route-close")
                        }
                    }
                }
            }
            if plan.routed, focused == nil {
                RouteTimelineSection(cards: cards, ask: ask, setFuel: { setting = $0 })
            }
            // The route's own edits and the flight in the air.
            RouteExtrasSection()
            if plan.course != nil, let template = charts.template {
                // The chart along the route for the air, as the web app's
                // KeepRoute keeps it, and the briefing, NOTAMs, cards,
                // plates and the rest with it (KeepForAir): tapped once,
                // the count as it goes, then the size it came to.
                Section {
                    Button {
                        keepForAir.keep(plan: plan, template: template, minZoom: charts.base?.minZoom ?? 6, verdict: verdict, signedIn: session.signedIn)
                    } label: {
                        KeepForAirLabel(model: keepForAir)
                    }
                    .disabled(keepForAir.keeping != nil && keepForAir.sizeMb == nil)
                }
            }
        }
        .appEntityIdentifier(SiriSaw.flight(plan))
        // Each field's card for its line: closed or not, its report, its
        // runways and its zone, asked once the course says which are fields.
        .task(id: plan.timelineFields) { await cards.load(plan.timelineFields) }
        // Each procedure picked as the planner draws it, for its fixes'
        // rows on the line.
        .task(id: plan.procedures) { await cards.loadDrawings(plan.procedures) }
        .sheet(item: $setting) { fuel in FuelSetSheet(ask: fuel).presentationDetents([.medium]) }
        // Leaving the page puts the keyboard away (the web's sheet audit,
        // 2026-11-12: focus left on a page put away kept the keyboard up).
        .onChange(of: nav.sheetPage) { _, _ in focused = nil }
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
