import SwiftUI

/// Ready to fly, the Brief's first row: the engine's line, its actions
/// (at most three, the most pressing first), each a tap that fixes it in
/// place, and every item folded under them with its detail and source.
/// The words, the order and what is missing are the engine's
/// (`ready_to_fly`); this draws them.
struct ReadyToFlyRows: View {
    @Environment(Navigator.self) private var nav
    @Environment(\.lookAccent) private var accent
    @Environment(ReadyToFly.self) private var model
    @State private var allOpen = false

    var body: some View {
        if let answer = model.answer {
            Label {
                Text(answer.line).font(WingtipType.row.weight(.semibold))
            } icon: {
                Image(systemName: FindingStyle.symbol(answer.finding)).accessibilityLabel(FindingStyle.word(answer.finding))
            }
            .foregroundStyle(FindingStyle.colour(answer.finding))
            .accessibilityElement(children: .combine)
            ForEach(answer.actions, id: \.key) { item in action(item) }
            DisclosureGroup(isExpanded: $allOpen) {
                ForEach(answer.items, id: \.key) { item in
                    Label {
                        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                            Text(item.line).font(WingtipType.row)
                            Text(item.detail).font(WingtipType.detail).foregroundStyle(.secondary)
                            Text(item.source).font(WingtipType.note).foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: FindingStyle.symbol(item.finding)).foregroundStyle(FindingStyle.colour(item.finding))
                            .accessibilityLabel(FindingStyle.word(item.finding))
                    }
                    .accessibilityElement(children: .combine)
                }
                Text("Next FAA data cycle \(answer.nextCycleIdent), \(ReadyFacts.dayWords(answer.nextCycle))")
                    .font(WingtipType.note).foregroundStyle(.secondary)
            } label: {
                Text("Every check").font(WingtipType.row)
            }
        } else if let problem = model.problem {
            ProblemLine(problem)
        } else {
            ProgressView("Checking what's on this device…")
        }
    }

    /// One action: a tap where the engine names a fix, plain words where
    /// nothing on the phone fixes it (the battery).
    @ViewBuilder private func action(_ item: EngineContract.ReadyItem) -> some View {
        if let fix = item.fix {
            Button { run(fix) } label: {
                HStack {
                    Text(item.line).font(WingtipType.row)
                    Spacer(minLength: WingtipSpace.sm)
                    if model.fixing.contains(fix) { ProgressView() }
                }
                // The whole row is the tap, its 44 points the list's own.
                .contentShape(Rectangle())
            }
            .tint(accent)
            .accessibilityHint(item.detail)
        } else {
            Text(item.line).font(WingtipType.row).foregroundStyle(.secondary)
        }
    }

    /// The fixes that ask the pilot open the pages that already ask it, in
    /// this card's stack with Back (Navigator.push): the Airplane page,
    /// the profile's Altitude Advisor; the route's fields are the plan's
    /// (back to it). The rest the model does in place.
    private func run(_ fix: String) {
        switch fix {
        case "pick_airplane": nav.push(.screen(.airplane))
        case "set_altitude": nav.push(.screen(.profile))
        case "set_route": nav.showPlan()
        default: Task { await model.run(fix) }
        }
    }
}

/// The Brief's section for it, refreshed as the plan changes and every
/// minute, as ages grow; the route's NOTAMs fetched for it on the way.
struct ReadyToFlySection: View {
    @Environment(KeepForAir.self) private var keepForAir
    @Environment(Receiver.self) private var receiver
    @Environment(Plan.self) private var plan
    @Environment(ReadyToFly.self) private var model

    /// What the facts hang on: asked again when any of it changes.
    private var key: String {
        let keep = keepForAir
        let keeping = keep.sizeMb.map { "kept \($0)" } ?? keep.keeping.map { $0.kept >= $0.wanted ? "tiles" : "keeping" } ?? ""
        return [ReadyToFly.flightKey(plan), plan.airplaneName ?? "", "\(plan.altitudeFt ?? 0)", "\(plan.briefedAt?.timeIntervalSince1970 ?? 0)",
                "\(plan.totals?.eteMin ?? 0)", keeping, "\(receiver.live)"].joined(separator: "|")
    }

    var body: some View {
        Section {
            ReadyToFlyRows()
        } header: {
            Text("Ready to Fly")
        }
        .task(id: key) {
            if keepForAir.keeping.map({ $0.kept >= $0.wanted }) == true { await model.chartsKeptChanged() }
            await model.refresh()
            await model.fetchNotams()
            while !Task.isCancelled {
                await model.refresh()
                try? await Task.sleep(for: .seconds(60))
            }
        }
    }
}

/// The app's models handed to Ready to Fly at the root, so a start from
/// outside the screen (the Control Center's flight) is answered too.
struct ReadyToFlyHost: ViewModifier {
    @Environment(ReadyToFly.self) private var ready
    @Environment(Plan.self) private var plan
    @Environment(Charts.self) private var charts
    @Environment(OwnShip.self) private var ownShip
    @Environment(Verdict.self) private var verdict
    @Environment(Session.self) private var session

    func body(content: Content) -> some View {
        content.task { ready.attach(plan: plan, charts: charts, ownShip: ownShip, verdict: verdict, session: session) }
    }
}

/// The check over a dry run's or a flight's start, once per flight while
/// something is missing: one stock alert (the owner's card rule,
/// 2026-11-10: "Ready to Fly is one section, plus one stock prompt"), its
/// line and the most pressing actions said, and "Fly Anyway", since the
/// pilot may always fly (warn, never limit); Open the Brief shows the
/// section with each fix a tap. From the top of the stack (TopHosts).
struct ReadyToFlyPrompt: ViewModifier {
    @Environment(Navigator.self) private var nav
    /// Whether this view is the top of the stack, the one that presents.
    let active: Bool
    @Environment(ReadyToFly.self) private var model

    func body(content: Content) -> some View {
        content
            .alert("Ready to Fly?", isPresented: Binding(get: { active && model.asking }, set: { if !$0 { model.notYet() } })) {
                Button("Fly Anyway") { model.flyAnyway() }
                Button("Open the Brief") {
                    model.notYet()
                    nav.open(.screen(.brief))
                }
                Button("Not Yet", role: .cancel) { model.notYet() }
            } message: {
                Text(Self.message(model.answer))
            }
    }

    /// The engine's line, then the actions it puts first, one a line, as
    /// the section has them.
    static func message(_ answer: EngineContract.ReadyToFlyAnswer?) -> String {
        guard let answer else { return "Checking what's on this device…" }
        return ([answer.line] + answer.actions.map(\.line)).joined(separator: "\n")
    }
}

/// The route's NOTAMs in the Brief (POST /api/notams/ranked, the
/// engine's ranking): the ones said first, each as sent, the rest folded.
struct NotamsSection: View {
    @Environment(Plan.self) private var plan
    @Environment(ReadyToFly.self) private var model

    var body: some View {
        if let ranked = model.notams {
            let top = ranked.notams.filter(\.top)
            let rest = ranked.notams.filter { !$0.top }
            Section("NOTAMs") {
                KeptAgeLine(kind: .notams, key: ReadyToFly.flightKey(plan))
                ForEach(top, id: \.id) { notam in row(notam) }
                if !rest.isEmpty {
                    DisclosureGroup("\(rest.count) more") { ForEach(rest, id: \.id) { notam in row(notam) } }
                }
                if ranked.notams.isEmpty {
                    Text("None for the route").foregroundStyle(.secondary)
                } else {
                    // Every one, searchable by place and kind (NotamListView).
                    NavigationLink("Show All \(ranked.notams.count)", value: SheetPage.notams(.route))
                }
            }
            NotamWordsSection(ranked: ranked.notams, flight: plan.routed
                ? WordsFigures.flight(dep: plan.dep, dest: plan.dest, stops: plan.stops, eteMin: plan.totals?.eteMin) : nil)
        } else if let problem = model.notamsProblem {
            Section("NOTAMs") { ProblemLine(problem) }
        }
    }

    private func row(_ notam: APIRankedNotam) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            Text([notam.field, notam.keyword].compactMap { $0 }.joined(separator: " · ")).font(WingtipType.row.weight(.semibold))
            Text(notam.raw).font(WingtipType.note.monospaced()).foregroundStyle(.secondary)
        }
        .siriSees(SiriSaw.notam(notam.id))
        .accessibilityElement(children: .combine)
    }
}
