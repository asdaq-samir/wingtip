import SwiftUI

/// The plan, the sheet's FPL page (PlanSheet, SheetPager), with no bar
/// of its own so its first row is the route's: with a route, its card
/// (RouteCard: the route, Ready to Fly, the figures, Brief, Nav Log,
/// Airplane and the route's •••), then the route -- its ends, its Routes,
/// the airplane and the altitude (RouteBoxRow) -- the stops and "Add a
/// Stop", the route's own edits and the procedures, in FPL's order. With
/// none, the route box empty, its close a level back (the web's, the
/// owner's 2026-11-11 "We don't need plan a flight either"), under the
/// first flight's card the first time; Favorites, Recents and Nearest are
/// the Search page's.
struct PlanView: View {
    @Environment(Plan.self) private var plan
    @Environment(Charts.self) private var charts
    @Environment(Verdict.self) private var verdict
    @Environment(Session.self) private var session
    @FocusState private var focused: Field?
    private var keepForAir: KeepForAir { .shared }
    /// A page of the plan's, opened by the sheet: pushed on the iPhone, the
    /// profile, the brief and the flights in the inspector on the iPad.
    let open: (Screen) -> Void
    /// "Add a Stop": the search, whose airport card has Add as Stop.
    let addStop: () -> Void

    enum Field { case dep, dest }

    var body: some View {
        @Bindable var plan = plan
        List {
            if plan.routed {
                RouteCard(open: open)
            }
            FirstFlightSection()
            Section {
                RouteEndsRow(focused: $focused)
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
                if !plan.routeState.hasPoints {
                    // The box empty -- cleared, or never filled -- its close
                    // a level back, where the route's ••• is with a route
                    // (the web's route box, 2026-11-12): to the field's card
                    // it was flown to from, else to Search.
                    HStack {
                        Spacer()
                        // The close glyph in glass, as a card's close is
                        // drawn in its bar (CloseButton's role-close in a
                        // list header drew the word "Close" alone).
                        Button {
                            focused = nil
                            Navigator.shared.closeEmptyRoute()
                        } label: {
                            Label("Close", systemImage: WingtipIcon.close).labelStyle(.iconOnly)
                        }
                        .glassButton()
                        .buttonBorderShape(.circle)
                        .accessibilityIdentifier("route-close")
                    }
                }
            }
            if plan.routed {
                // The stops in order, each a swipe from going and all
                // of them draggable into another order, as the web
                // app's route list has them; then "Add a Stop", the
                // search, whose airport card adds it (the Plan
                // artboard's "+ Add a stop").
                Section {
                    ForEach(Array(plan.stops.enumerated()), id: \.offset) { _, stop in
                        RoutePointMenu(ident: stop)
                    }
                    .onDelete { at in plan.stops.remove(atOffsets: at); plan.plan() }
                    .onMove { from, to in plan.stops.move(fromOffsets: from, toOffset: to); plan.plan() }
                    Button(action: addStop) { Label("Add a Stop", systemImage: "plus") }
                } header: {
                    // The stops' Edit (delete, move) at the header's
                    // right, as iOS's lists put it, since the bar it was
                    // in is gone (the one-row header, 2026-11-10).
                    HStack {
                        Text("Stops")
                        Spacer()
                        if !plan.stops.isEmpty { EditButton().textCase(nil) }
                    }
                }
            }
            // The route's own edits and the flight in the air.
            RouteExtrasSection()
            if plan.course != nil {
                // Each field's procedures, pull-downs as the web app's
                // route list has them: the departure's departures, every
                // landing's arrivals and approaches.
                Section("Procedures") {
                    ProceduresRow(ident: plan.dep, kinds: ["departure"])
                    ForEach(plan.stops + [plan.dest], id: \.self) { field in
                        ProceduresRow(ident: field, kinds: ["arrival", "approach"])
                    }
                }
            }
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
        .siriSees(SiriSaw.flight(plan))
        // Leaving the page puts the keyboard away (the web's sheet audit,
        // 2026-11-12: focus left on a page put away kept the keyboard up).
        .onChange(of: Navigator.shared.sheetPage) { _, _ in focused = nil }
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
