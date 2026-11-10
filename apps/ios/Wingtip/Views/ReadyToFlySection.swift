import SwiftUI

/// Ready to fly, the Brief's first row: the engine's line, its actions
/// (at most three, the most pressing first), each a tap that fixes it in
/// place, and every item folded under them with its detail and source.
/// The words, the order and what is missing are the engine's
/// (`ready_to_fly`); this draws them.
struct ReadyToFlyRows: View {
    @Environment(\.dismiss) private var dismiss
    private var model: ReadyToFly { .shared }
    /// The airplane picker and the altitude wheel, opened by their fixes
    /// from the line's row, as PickAirplaneRow opens the picker.
    @State private var picking = false
    @State private var altitude = false
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
            .readyToFlyPickers(picking: $picking, altitude: $altitude)
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
            .tint(.accentColor)
            .accessibilityHint(item.detail)
        } else {
            Text(item.line).font(WingtipType.row).foregroundStyle(.secondary)
        }
    }

    /// The fixes that ask the pilot open the screens that already ask it:
    /// the airplane picker, the altitude wheel, the route's fields on FPL
    /// (back to them). The rest the model does in place.
    private func run(_ fix: String) {
        switch fix {
        case "pick_airplane": picking = true
        case "set_altitude": altitude = true
        case "set_route": dismiss()
        default: Task { await model.run(fix) }
        }
    }
}

/// The Brief's section for it, refreshed as the plan changes and every
/// minute, as ages grow; the route's NOTAMs fetched for it on the way.
struct ReadyToFlySection: View {
    @Environment(Plan.self) private var plan
    private var model: ReadyToFly { .shared }

    /// What the facts hang on: asked again when any of it changes.
    private var key: String {
        let keep = KeepForAir.shared
        let keeping = keep.sizeMb.map { "kept \($0)" } ?? keep.keeping.map { $0.kept >= $0.wanted ? "tiles" : "keeping" } ?? ""
        return [ReadyToFly.flightKey(plan), plan.airplaneName ?? "", "\(plan.altitudeFt ?? 0)", "\(plan.briefedAt?.timeIntervalSince1970 ?? 0)",
                "\(plan.totals?.eteMin ?? 0)", keeping, "\(Receiver.shared.live)"].joined(separator: "|")
    }

    var body: some View {
        Section {
            ReadyToFlyRows()
        } header: {
            Text("Ready to Fly")
        }
        .task(id: key) {
            if KeepForAir.shared.keeping.map({ $0.kept >= $0.wanted }) == true { await model.chartsKeptChanged() }
            await model.refresh()
            await model.fetchNotams()
            while !Task.isCancelled {
                await model.refresh()
                try? await Task.sleep(for: .seconds(60))
            }
        }
    }
}

/// The check over a dry run's or a flight's start, once per flight while
/// something is missing: the same rows, and "Fly anyway", since the pilot
/// may always fly (warn, never limit). Hosted at the root beside the
/// welcome (one view presents one sheet at a time), and given the app's
/// models for a start from outside the screen.
struct ReadyToFlyHost: ViewModifier {
    @Environment(Plan.self) private var plan
    @Environment(Charts.self) private var charts
    @Environment(OwnShip.self) private var ownShip
    @Environment(Verdict.self) private var verdict
    @Environment(Session.self) private var session
    private var model: ReadyToFly { .shared }

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: Binding(get: { model.asking }, set: { if !$0 { model.notYet() } })) {
                NavigationStack {
                    List { Section { ReadyToFlyRows() } }
                        .navigationTitle("Ready to Fly")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) { Button("Not Yet") { model.notYet() } }
                            ToolbarItem(placement: .confirmationAction) { Button("Fly Anyway") { model.flyAnyway() } }
                        }
                }
                .presentationDetents([.medium, .large])
            }
            .task { model.attach(plan: plan, charts: charts, ownShip: ownShip, verdict: verdict, session: session) }
    }
}

extension View {
    /// The existing airplane picker and altitude wheel, over the screen.
    func readyToFlyPickers(picking: Binding<Bool>, altitude: Binding<Bool>) -> some View {
        sheet(isPresented: picking) { AircraftView() }
            .sheet(isPresented: altitude) { NavigationStack { ProfileCard().closesBack() } }
    }
}

/// The route's NOTAMs in the Brief (POST /api/notams/ranked, the
/// engine's ranking): the ones said first, each as sent, the rest folded.
struct NotamsSection: View {
    @Environment(Plan.self) private var plan
    private var model: ReadyToFly { .shared }

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
